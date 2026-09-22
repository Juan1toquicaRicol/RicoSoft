import { beforeEach, describe, it, expect } from "vitest";
import {
  VISTAS_SIESA_MONITOREADAS,
  comprobarSiesa,
  detectarInterfacesTunel,
  mensajeSeguro,
  obtenerReporteSiesa,
  reiniciarCacheSiesa,
  type DependenciasSonda,
  type ResultadoConsulta,
} from "./siesa-health.service";

const SECRETOS = {
  SIESA_DB_HOST: "db06.siesacloud.local",
  SIESA_DB_PORT: "1433",
  SIESA_DB_NAME: "BD_SECRETA_UNOEE",
  SIESA_DB_USER: "usuario_secreto",
  SIESA_DB_PASSWORD: "P@ssw0rd-MUY-SECRETO",
};

/** Reloj falso que avanza `paso` ms en cada lectura: las latencias salen deterministas. */
function relojFalso(paso = 5) {
  let t = 1_000;
  return () => (t += paso);
}

function deps(over: Partial<DependenciasSonda> = {}): DependenciasSonda {
  return {
    env: { ...SECRETOS },
    ahoraMs: relojFalso(),
    resolverDns: async () => "10.8.0.15",
    probarTcp: async () => undefined,
    ejecutarConsultas: async (consultas) =>
      consultas.map((): ResultadoConsulta => ({ ok: true, latenciaMs: 12 })),
    interfacesDeRed: () => ["Ethernet", "OpenVPN TAP-Windows6"],
    ...over,
  };
}

const errorConCodigo = (code: string, message = "detalle interno del driver") =>
  Object.assign(new Error(message), { code });

describe("comprobarSiesa — Siesa disponible", () => {
  it("todo OK => OPERATIVO, con latencias y sin mensajes de error", async () => {
    const r = await comprobarSiesa(deps());
    expect(r.estadoGeneral).toBe("OPERATIVO");
    expect(r.configuracion).toMatchObject({
      configurada: true,
      host: SECRETOS.SIESA_DB_HOST,
      puerto: 1433,
    });
    expect(r.conectividad).toMatchObject({ estado: "OK", mensaje: null });
    expect(r.sql.estado).toBe("OK");
    expect(r.vistas.map((v) => v.nombre)).toEqual([...VISTAS_SIESA_MONITOREADAS]);
    expect(r.vistas.every((v) => v.estado === "OK")).toBe(true);
    expect(r.vpn.rutaSiesa).toMatchObject({ estado: "OK", direccion: "10.8.0.15" });
    expect(r.vpn.interfazTunel).toMatchObject({
      estado: "OK",
      interfaces: ["OpenVPN TAP-Windows6"],
    });
    expect(r.conectividad.latenciaMs).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(r.comprobadoEn))).toBe(false);
  });

  it("la prueba es liviana: un SELECT 1 y un SELECT TOP (1) por tabla, todos de solo lectura", async () => {
    let enviadas: string[] = [];
    await comprobarSiesa(
      deps({
        ejecutarConsultas: async (c) => {
          enviadas = c;
          return c.map(() => ({ ok: true, latenciaMs: 1 }));
        },
      }),
    );
    expect(enviadas).toHaveLength(1 + VISTAS_SIESA_MONITOREADAS.length);
    expect(enviadas[0]).toBe("SELECT 1 AS ok");
    for (const q of enviadas.slice(1))
      expect(q).toMatch(/^SELECT TOP \(1\) 1 AS ok FROM t\d{3}_\w+ WITH \(NOLOCK\)$/);
    expect(enviadas.join(" ")).not.toMatch(/INSERT|UPDATE|DELETE|DROP|EXEC/i);
  });

  it("una tabla que falla degrada el estado, sin marcar caída", async () => {
    const r = await comprobarSiesa(
      deps({
        ejecutarConsultas: async (c) =>
          c.map((_, i) => ({
            ok: i !== 2,
            latenciaMs: 3,
            codigoError: i === 2 ? "EREQUEST" : undefined,
          })),
      }),
    );
    expect(r.estadoGeneral).toBe("DEGRADADO");
    expect(r.sql.estado).toBe("OK");
    expect(r.vistas.filter((v) => v.estado === "FALLO")).toHaveLength(1);
    expect(r.vistas.find((v) => v.estado === "FALLO")!.mensaje).toMatch(/tabla existe/);
  });
});

describe("comprobarSiesa — Siesa no disponible (error controlado)", () => {
  it("TCP rechazado => CAIDO; no se intenta SQL y se explica por qué", async () => {
    let intentoSql = false;
    const r = await comprobarSiesa(
      deps({
        probarTcp: async () => {
          throw errorConCodigo("ECONNREFUSED");
        },
        ejecutarConsultas: async () => {
          intentoSql = true;
          return [];
        },
      }),
    );
    expect(r.estadoGeneral).toBe("CAIDO");
    expect(r.conectividad).toMatchObject({
      estado: "FALLO",
      mensaje: "Conexión rechazada por el servidor.",
    });
    expect(r.sql.estado).toBe("OMITIDO");
    expect(r.vistas.every((v) => v.estado === "OMITIDO")).toBe(true);
    expect(intentoSql).toBe(false);
  });

  it("el nombre no resuelve (VPN caída) => ruta FALLO, resto omitido, mensaje claro", async () => {
    const r = await comprobarSiesa(
      deps({
        resolverDns: async () => {
          throw errorConCodigo("ENOTFOUND");
        },
      }),
    );
    expect(r.estadoGeneral).toBe("CAIDO");
    expect(r.vpn.rutaSiesa).toMatchObject({ estado: "FALLO", direccion: null });
    expect(r.vpn.rutaSiesa.mensaje).toMatch(/resolver el nombre/);
    expect(r.conectividad.estado).toBe("OMITIDO");
  });

  it("timeout de TCP => CAIDO con mensaje de tiempo agotado", async () => {
    const r = await comprobarSiesa(
      deps({
        probarTcp: async () => {
          throw errorConCodigo("ETIMEOUT");
        },
      }),
    );
    expect(r.estadoGeneral).toBe("CAIDO");
    expect(r.conectividad.mensaje).toBe("Tiempo de espera agotado.");
  });

  it("login SQL rechazado => CAIDO en SQL, tablas omitidas", async () => {
    const r = await comprobarSiesa(
      deps({
        ejecutarConsultas: async () => {
          throw errorConCodigo("ELOGIN", "Login failed for user 'usuario_secreto'");
        },
      }),
    );
    expect(r.estadoGeneral).toBe("CAIDO");
    expect(r.conectividad.estado).toBe("OK");
    expect(r.sql).toMatchObject({
      estado: "FALLO",
      mensaje: "El servidor rechazó la autenticación.",
    });
    expect(r.vistas.every((v) => v.estado === "OMITIDO")).toBe(true);
  });

  it("sin variables de conexión => NO_CONFIGURADO, sin intentar ninguna conexión", async () => {
    let intentos = 0;
    const r = await comprobarSiesa(
      deps({
        env: { SIESA_DB_HOST: "host-x" },
        resolverDns: async () => {
          intentos++;
          return "1.1.1.1";
        },
        probarTcp: async () => {
          intentos++;
        },
        ejecutarConsultas: async () => {
          intentos++;
          return [];
        },
      }),
    );
    expect(r.estadoGeneral).toBe("NO_CONFIGURADO");
    expect(r.configuracion.configurada).toBe(false);
    expect(r.configuracion.host).toBeNull();
    expect(r.configuracion.variablesFaltantes).toEqual(
      expect.arrayContaining(["SIESA_DB_NAME", "SIESA_DB_USER", "SIESA_DB_PASSWORD"]),
    );
    expect(intentos).toBe(0);
  });
});

describe("comprobarSiesa — no expone secretos", () => {
  it("ninguna respuesta (ni éxito ni cada tipo de fallo) contiene credenciales, base de datos ni texto crudo del driver", async () => {
    const crudo = `Login failed for user '${SECRETOS.SIESA_DB_USER}' password=${SECRETOS.SIESA_DB_PASSWORD} db=${SECRETOS.SIESA_DB_NAME} Server=${SECRETOS.SIESA_DB_HOST}`;
    const escenarios: Partial<DependenciasSonda>[] = [
      {},
      {
        resolverDns: async () => {
          throw errorConCodigo("ENOTFOUND", crudo);
        },
      },
      {
        probarTcp: async () => {
          throw errorConCodigo("ETIMEDOUT", crudo);
        },
      },
      {
        ejecutarConsultas: async () => {
          throw errorConCodigo("ELOGIN", crudo);
        },
      },
      {
        ejecutarConsultas: async () => {
          throw new Error(crudo);
        },
      },
      {
        ejecutarConsultas: async (c) =>
          c.map(() => ({ ok: false, latenciaMs: 1, codigoError: "EREQUEST" })),
      },
    ];
    for (const escenario of escenarios) {
      const json = JSON.stringify(await comprobarSiesa(deps(escenario)));
      expect(json).not.toContain(SECRETOS.SIESA_DB_PASSWORD);
      expect(json).not.toContain(SECRETOS.SIESA_DB_USER);
      expect(json).not.toContain(SECRETOS.SIESA_DB_NAME);
      expect(json).not.toMatch(/password|Login failed|Server=/i);
    }
  });

  it("mensajeSeguro traduce por código y nunca devuelve el texto del error", () => {
    expect(mensajeSeguro(errorConCodigo("EHOSTUNREACH", "secreto"))).toMatch(/VPN/);
    expect(mensajeSeguro(new Error("contraseña: abc123"))).toBe(
      "No se pudo completar la comprobación.",
    );
    expect(mensajeSeguro(undefined)).toBe("No se pudo completar la comprobación.");
    expect(mensajeSeguro({ number: 208, message: "Invalid object name 'x'" })).toBe(
      "El servidor rechazó la consulta.",
    );
  });
});

describe("VPN: solo se observa", () => {
  it("detecta interfaces de túnel por nombre (tun/tap/OpenVPN/WireGuard) y no confunde adaptadores normales", () => {
    expect(
      detectarInterfacesTunel(["Ethernet", "Wi-Fi", "tun0", "OpenVPN TAP-Windows6", "wg0", "lo"]),
    ).toEqual(["tun0", "OpenVPN TAP-Windows6", "wg0"]);
    expect(detectarInterfacesTunel(["Ethernet", "Wi-Fi", "Loopback"])).toEqual([]);
  });

  it("sin interfaz detectada el estado es DESCONOCIDO (no concluyente), no FALLO", async () => {
    const r = await comprobarSiesa(deps({ interfacesDeRed: () => ["Ethernet"] }));
    expect(r.vpn.interfazTunel.estado).toBe("DESCONOCIDO");
    expect(r.vpn.interfazTunel.mensaje).toMatch(/no es concluyente/i);
    // La conectividad real manda: el servicio sigue operativo.
    expect(r.estadoGeneral).toBe("OPERATIVO");
  });
});

describe("obtenerReporteSiesa — caché y deduplicación", () => {
  beforeEach(() => reiniciarCacheSiesa());

  it("peticiones simultáneas comparten UNA sola comprobación real", async () => {
    let comprobaciones = 0;
    const d = deps({
      probarTcp: async () => {
        comprobaciones++;
        await new Promise((r) => setTimeout(r, 10));
      },
    });
    const [a, b, c] = await Promise.all([
      obtenerReporteSiesa({}, d),
      obtenerReporteSiesa({}, d),
      obtenerReporteSiesa({}, d),
    ]);
    expect(comprobaciones).toBe(1);
    expect(a.reporte).toBe(b.reporte);
    expect(b.reporte).toBe(c.reporte);
  });

  it("reutiliza el resultado reciente y `forzar` lo ignora", async () => {
    let comprobaciones = 0;
    let ahora = 1_000_000;
    const d = deps({
      ahoraMs: () => ahora,
      probarTcp: async () => {
        comprobaciones++;
      },
    });
    expect((await obtenerReporteSiesa({}, d)).desdeCache).toBe(false);
    ahora += 2_000;
    expect((await obtenerReporteSiesa({}, d)).desdeCache).toBe(true);
    expect(comprobaciones).toBe(1);
    expect((await obtenerReporteSiesa({ forzar: true }, d)).desdeCache).toBe(false);
    expect(comprobaciones).toBe(2);
    ahora += 60_000; // el resultado expira
    expect((await obtenerReporteSiesa({}, d)).desdeCache).toBe(false);
    expect(comprobaciones).toBe(3);
  });
});
