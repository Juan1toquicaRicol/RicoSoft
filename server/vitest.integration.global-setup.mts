import { validarDestinoIntegracion } from "./src/lib/integration-db-guard";

// Se ejecuta una vez antes de la suite de integración. Si el destino no es una
// base aprobada (saas_dev_qa, o la efímera de CI en localhost) aborta antes de
// que cualquier test cree datos. Solo imprime host y base, nunca credenciales.
export default function setup() {
  const destino = validarDestinoIntegracion(process.env.DATABASE_URL);
  console.log(`[integración] destino verificado: ${destino.database} @ ${destino.host}`);
}
