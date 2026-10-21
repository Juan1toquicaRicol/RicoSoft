import { describe, it, expect } from "vitest";
import { parsearDatabaseUrl, validarDestinoIntegracion, validarDestinoQa } from "./integration-db-guard";

const url = (db: string, user = "saas_dev_qa_runner", host = "192.168.0.234") =>
  `sqlserver://${host}:1433;database=${db};user=${user};password=x;encrypt=false`;

describe("validarDestinoIntegracion", () => {
  it("acepta saas_dev_qa con login de mínimo privilegio", () => {
    expect(validarDestinoIntegracion(url("saas_dev_qa")).database).toBe("saas_dev_qa");
  });

  it("rechaza saas_dev y UnoEE_Ricol_Real (sin importar mayúsculas)", () => {
    expect(() => validarDestinoIntegracion(url("saas_dev"))).toThrow(/prohibida/);
    expect(() => validarDestinoIntegracion(url("SAAS_DEV"))).toThrow(/prohibida/);
    expect(() => validarDestinoIntegracion(url("UnoEE_Ricol_Real"))).toThrow(/prohibida/);
  });

  it("rechaza bases no aprobadas y la base efímera de CI fuera de localhost", () => {
    expect(() => validarDestinoIntegracion(url("otra_base"))).toThrow(/no está aprobada/);
    expect(() => validarDestinoIntegracion(url("ricosoft_integration"))).toThrow(/no está aprobada/);
  });

  it("acepta la base efímera de CI solo en localhost", () => {
    expect(validarDestinoIntegracion(url("ricosoft_integration", "sa", "localhost")).database).toBe("ricosoft_integration");
  });

  it("rechaza saas_dev_qa en un host distinto al aprobado", () => {
    expect(() => validarDestinoIntegracion(url("saas_dev_qa", "saas_dev_qa_runner", "10.0.0.5"))).toThrow(/solo se acepta en 192\.168\.0\.234/);
    expect(() => validarDestinoIntegracion(url("saas_dev_qa", "qa_runner", "localhost"))).toThrow(/solo se acepta/);
  });

  it("rechaza sa contra saas_dev_qa", () => {
    expect(() => validarDestinoIntegracion(url("saas_dev_qa", "sa"))).toThrow(/sa/);
  });

  it("rechaza DATABASE_URL ausente o con formato inválido", () => {
    expect(() => validarDestinoIntegracion(undefined)).toThrow(/no está definida/);
    expect(() => validarDestinoIntegracion("mssql://x/saas_dev_qa")).toThrow(/formato/);
  });

  it("no filtra la contraseña en los mensajes de error", () => {
    expect(() => validarDestinoIntegracion(url("saas_dev").replace("password=x", "password=SECRETO123"))).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("SECRETO123") }),
    );
  });
});

describe("parsearDatabaseUrl", () => {
  it("extrae host, base y usuario", () => {
    expect(parsearDatabaseUrl(url("saas_dev_qa"))).toEqual({ host: "192.168.0.234", port: 1433, instance: "", database: "saas_dev_qa", user: "saas_dev_qa_runner" });
  });
});

describe("validarDestinoQa", () => {
  it("solo acepta saas_dev_qa, no la base efímera de CI", () => {
    expect(validarDestinoQa(url("saas_dev_qa", "saas_dev_qa_runner"), "runner").database).toBe("saas_dev_qa");
    expect(() => validarDestinoQa(url("ricosoft_integration", "sa", "localhost"), "runner")).toThrow(/solo opera sobre saas_dev_qa/);
    expect(() => validarDestinoQa(url("saas_dev"), "runner")).toThrow(/prohibida/);
  });

  it("exige el login que corresponde al rol", () => {
    expect(() => validarDestinoQa(url("saas_dev_qa", "saas_dev_qa_migrador"), "runner")).toThrow(/saas_dev_qa_runner/);
    expect(() => validarDestinoQa(url("saas_dev_qa", "saas_dev_qa_runner"), "migrador")).toThrow(/saas_dev_qa_migrador/);
    expect(() => validarDestinoQa(url("saas_dev_qa", "otro"), "runner")).toThrow(/se exige el login saas_dev_qa_runner/);
    expect(validarDestinoQa(url("saas_dev_qa", "saas_dev_qa_migrador"), "migrador").user).toBe("saas_dev_qa_migrador");
  });

  it("la suite genérica exige el login runner para la base QA", () => {
    expect(() => validarDestinoIntegracion(url("saas_dev_qa", "saas_dev_qa_migrador"))).toThrow(/se exige el login saas_dev_qa_runner/);
  });
});

describe("puerto e instancia", () => {
  it("rechaza saas_dev_qa en otro puerto o con nombre de instancia", () => {
    const base = "sqlserver://192.168.0.234";
    const resto = ";database=saas_dev_qa;user=saas_dev_qa_runner;password=x";
    expect(() => validarDestinoIntegracion(`${base}:1434${resto}`)).toThrow(/puerto 1433/);
    expect(() => validarDestinoIntegracion(`${base}\\OTRA:1433${resto}`)).toThrow(/instancia/);
    expect(validarDestinoIntegracion(`${base}${resto}`).port).toBe(1433);
  });
});
