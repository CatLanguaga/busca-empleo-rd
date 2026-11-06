// @ts-check
// Computrabajo RD can only be read by keyword: it has no browsable listing.
// This fixed list decides what the page can find there, so it covers the
// common professions in Dominican job ads rather than any one person's roles.
// Each keyword costs one request per scan (one page of 20 offers).

export const COMPUTRABAJO_KEYWORDS = [
  // Oficina y finanzas
  'contabilidad', 'auditor', 'asistente administrativo', 'recepcionista',
  'recursos humanos', 'analista financiero', 'credito y cobros', 'secretaria',
  // Comercial y atención
  'ventas', 'servicio al cliente', 'call center', 'cajero',
  'mercadeo', 'ejecutivo de negocios', 'promotor',
  // Tecnología
  'programador', 'desarrollador', 'soporte tecnico', 'analista de datos', 'redes',
  // Ingeniería y técnicos
  'ingeniero civil', 'ingeniero industrial', 'electricista', 'mecanico',
  'tecnico de mantenimiento', 'arquitecto',
  // Operaciones
  'almacen', 'logistica', 'chofer', 'mensajero', 'seguridad', 'supervisor',
  // Salud, educación, legal
  'enfermera', 'medico', 'farmacia', 'docente', 'abogado',
  // Turismo y servicios
  'cocinero', 'camarero', 'hotel',
];
