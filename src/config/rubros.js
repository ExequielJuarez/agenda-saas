// Rubros disponibles. Al elegir uno, el negocio arranca con servicios sugeridos, horario típico
// y las palabras de su rubro (paciente, alumno, socio…). Después edita todo desde su panel.
// precio 0 = "Consultar" hasta que el negocio ponga el suyo (los precios cambian demasiado como para fijarlos acá).

const T = (cliente, clientes, turno, turnos, servicio, servicios) => ({ cliente, clientes, turno, turnos, servicio, servicios });
const LV = [1, 2, 3, 4, 5];
const LS = [1, 2, 3, 4, 5, 6];
const h = (days, from, to, step) => ({ days, from, to, step });
const s = (categoria, nombre, minutos, descripcion = "") => ({ categoria, nombre, minutos, precio: 0, descripcion });

const rubros = [
  {
    id: "barberia", nombre: "Barbería", terminos: T("cliente", "clientes", "turno", "turnos", "servicio", "servicios"), horario: h(LS, "10:00", "20:00", 30),
    servicios: [s("Cortes", "Corte de pelo", 30, "Con lavado y peinado."), s("Cortes", "Degradé / fade", 45), s("Barba", "Perfilado de barba", 30), s("Combos", "Corte + barba", 60), s("Cortes", "Corte niño", 30)],
  },
  {
    id: "peluqueria", nombre: "Peluquería y salón de belleza", terminos: T("cliente", "clientes", "turno", "turnos", "servicio", "servicios"), horario: h([2, 3, 4, 5, 6], "10:00", "19:00", 30),
    servicios: [s("Cabello", "Corte y brushing", 60), s("Cabello", "Color completo", 120), s("Cabello", "Mechas / balayage", 180), s("Cabello", "Tratamiento capilar", 60), s("Peinados", "Peinado para eventos", 60)],
  },
  {
    id: "unas", nombre: "Uñas, estética y depilación", terminos: T("clienta", "clientas", "turno", "turnos", "servicio", "servicios"), horario: h(LS, "10:00", "19:00", 30),
    servicios: [s("Manos", "Manicuría semipermanente", 60), s("Manos", "Esculpidas", 120), s("Pies", "Pedicuría", 60), s("Rostro", "Limpieza facial", 60), s("Depilación", "Depilación definitiva (sesión)", 30)],
  },
  {
    id: "kinesiologia", nombre: "Kinesiología y fisioterapia", terminos: T("paciente", "pacientes", "sesión", "sesiones", "tratamiento", "tratamientos"), horario: h(LV, "08:00", "20:00", 30),
    servicios: [s("Consultas", "Primera consulta y evaluación", 45, "Evaluación y plan de tratamiento."), s("Sesiones", "Sesión de rehabilitación", 45), s("Sesiones", "Masoterapia / descontracturante", 45), s("Sesiones", "Rehabilitación deportiva", 60)],
  },
  {
    id: "psicologia", nombre: "Psicología y terapias", terminos: T("paciente", "pacientes", "sesión", "sesiones", "tipo de sesión", "tipos de sesión"), horario: h(LV, "09:00", "20:00", 60),
    servicios: [s("Individual", "Primera entrevista", 60), s("Individual", "Sesión individual", 50), s("Pareja y familia", "Sesión de pareja", 60), s("Online", "Sesión por videollamada", 50)],
  },
  {
    id: "nutricion", nombre: "Nutrición", terminos: T("paciente", "pacientes", "consulta", "consultas", "consulta", "consultas"), horario: h(LV, "09:00", "19:00", 30),
    servicios: [s("Consultas", "Primera consulta", 60, "Evaluación, antropometría y plan."), s("Consultas", "Control de seguimiento", 30), s("Online", "Consulta por videollamada", 30)],
  },
  {
    id: "odontologia", nombre: "Odontología", terminos: T("paciente", "pacientes", "turno", "turnos", "tratamiento", "tratamientos"), horario: h(LV, "09:00", "18:00", 30),
    servicios: [s("Consultas", "Consulta y diagnóstico", 30), s("Prevención", "Limpieza dental", 45), s("Estética", "Blanqueamiento", 60), s("Ortodoncia", "Control de ortodoncia", 30), s("Urgencias", "Urgencia dental", 30)],
  },
  {
    id: "consultorio", nombre: "Consultorio médico", terminos: T("paciente", "pacientes", "turno", "turnos", "consulta", "consultas"), horario: h(LV, "08:00", "18:00", 20),
    servicios: [s("Consultas", "Primera consulta", 30), s("Consultas", "Control", 20), s("Estudios", "Estudio / práctica", 30)],
  },
  {
    id: "veterinaria", nombre: "Veterinaria", terminos: T("paciente", "pacientes", "turno", "turnos", "servicio", "servicios"), horario: h(LS, "09:00", "19:00", 30),
    servicios: [s("Consultas", "Consulta clínica", 30), s("Prevención", "Vacunación", 15), s("Prevención", "Desparasitación", 15), s("Estética", "Baño y corte", 60), s("Cirugía", "Castración (turno previo)", 60)],
  },
  {
    id: "taller", nombre: "Taller mecánico", terminos: T("cliente", "clientes", "turno", "turnos", "trabajo", "trabajos"), horario: h(LS, "08:00", "18:00", 60),
    servicios: [s("Mantenimiento", "Service completo", 120, "Aceite, filtros y revisión general."), s("Mantenimiento", "Cambio de aceite y filtro", 60), s("Frenos y suspensión", "Revisión de frenos", 60), s("Frenos y suspensión", "Alineación y balanceo", 60), s("Diagnóstico", "Diagnóstico con scanner", 60), s("Presupuestos", "Presupuesto de reparación", 30)],
  },
  {
    id: "lavadero", nombre: "Lavadero de autos", terminos: T("cliente", "clientes", "turno", "turnos", "servicio", "servicios"), horario: h(LS, "08:00", "18:00", 30),
    servicios: [s("Lavado", "Lavado exterior", 30), s("Lavado", "Lavado completo (interior y exterior)", 60), s("Detailing", "Pulido y encerado", 120), s("Detailing", "Limpieza de tapizados", 90)],
  },
  {
    id: "musica", nombre: "Academia de música", terminos: T("alumno", "alumnos", "clase", "clases", "clase", "clases"), horario: h(LS, "10:00", "21:00", 60),
    servicios: [s("Clases individuales", "Clase de guitarra", 60), s("Clases individuales", "Clase de piano / teclado", 60), s("Clases individuales", "Clase de canto", 60), s("Clases individuales", "Clase de batería", 60), s("Prueba", "Clase de prueba", 30)],
  },
  {
    id: "idiomas", nombre: "Idiomas y apoyo escolar", terminos: T("alumno", "alumnos", "clase", "clases", "clase", "clases"), horario: h(LV, "09:00", "21:00", 60),
    servicios: [s("Idiomas", "Clase de inglés", 60), s("Idiomas", "Clase de portugués", 60), s("Apoyo escolar", "Apoyo escolar primaria", 60), s("Apoyo escolar", "Apoyo escolar secundaria", 60), s("Prueba", "Clase de prueba", 30)],
  },
  {
    id: "gimnasio", nombre: "Gimnasio y entrenador personal", terminos: T("socio", "socios", "turno", "turnos", "servicio", "servicios"), horario: h(LS, "07:00", "21:00", 60),
    servicios: [s("Entrenamiento", "Entrenamiento personalizado", 60), s("Entrenamiento", "Clase grupal", 60), s("Evaluación", "Evaluación física inicial", 45), s("Prueba", "Clase de prueba", 60)],
  },
  {
    id: "pilates", nombre: "Pilates y yoga", terminos: T("alumno", "alumnos", "clase", "clases", "clase", "clases"), horario: h(LS, "08:00", "21:00", 60),
    servicios: [s("Pilates", "Clase de pilates (reformer)", 60), s("Pilates", "Clase de pilates (suelo)", 60), s("Yoga", "Clase de yoga", 60), s("Prueba", "Clase de prueba", 60)],
  },
  {
    id: "tatuajes", nombre: "Tatuajes y piercing", terminos: T("cliente", "clientes", "turno", "turnos", "servicio", "servicios"), horario: h([2, 3, 4, 5, 6], "12:00", "20:00", 60),
    servicios: [s("Tatuajes", "Tatuaje pequeño", 60), s("Tatuajes", "Tatuaje mediano", 180), s("Tatuajes", "Sesión de tatuaje grande", 240), s("Piercing", "Piercing", 30), s("Consultas", "Consulta de diseño", 30)],
  },
  {
    id: "fotografia", nombre: "Estudio de fotografía", terminos: T("cliente", "clientes", "sesión", "sesiones", "sesión", "sesiones"), horario: h(LS, "10:00", "19:00", 60),
    servicios: [s("Sesiones", "Sesión de retratos", 60), s("Sesiones", "Sesión de familia", 90), s("Sesiones", "Fotos de producto", 120), s("Sesiones", "Book / sesión de moda", 120)],
  },
  {
    id: "general", nombre: "Otro tipo de negocio", terminos: T("cliente", "clientes", "turno", "turnos", "servicio", "servicios"), horario: h(LS, "09:00", "18:00", 30),
    servicios: [s("General", "Turno general", 30)],
  },
];

const porId = Object.fromEntries(rubros.map((r) => [r.id, r]));

module.exports = {
  rubros,
  obtener: (id) => porId[id] || porId.general,
  existe: (id) => id in porId,
  ids: rubros.map((r) => r.id),
  lista: () => rubros.map((r) => ({ id: r.id, name: r.nombre })),
};
