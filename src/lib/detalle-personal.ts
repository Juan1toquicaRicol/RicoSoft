// Formulario de "Detalles" del colaborador (valores de texto; fechas como YYYY-MM-DD).
export interface DetallePersonalForm {
  fechaNacimiento: string;
  lugarNacimiento: string;
  fechaExpedicionDocumento: string;
  ciudadResidencia: string;
  departamentoResidencia: string;
  direccion: string;
  telefonoPrincipal: string;
  telefonoSecundario: string;
  correoPersonal: string;
  eps: string;
  arl: string;
  fondoPensiones: string;
}

export const DETALLE_PERSONAL_VACIO: DetallePersonalForm = {
  fechaNacimiento: "",
  lugarNacimiento: "",
  fechaExpedicionDocumento: "",
  ciudadResidencia: "",
  departamentoResidencia: "",
  direccion: "",
  telefonoPrincipal: "",
  telefonoSecundario: "",
  correoPersonal: "",
  eps: "",
  arl: "",
  fondoPensiones: "",
};

/** Listas cerradas de residencia (espejo de server empleado-detalles.controller.ts). */
export const CIUDADES_RESIDENCIA = ["BOGOTA", "MEDELLIN", "CALI"];
export const DEPARTAMENTOS_RESIDENCIA = ["VALLE DEL CAUCA", "ANTIOQUIA"];
