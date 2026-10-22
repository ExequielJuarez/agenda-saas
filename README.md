# Agendo — micro-app de turnos por suscripción

Sistema para ofrecer una agenda de turnos como servicio: **vos cobrás una suscripción mensual** ($25.000 por defecto) y cada cliente tiene su propio panel.

Hecho sobre la base de proyectos `carpeta-base`: **Node.js + Express 5 + EJS + Sequelize + MySQL**, sesiones con `express-session`, contraseñas con `bcryptjs` y validaciones con `express-validator`.

## Qué incluye

**Panel del dueño (`/owner`)** — el tuyo:
- Ingreso mensual recurrente (MRR), cobrado del mes, histórico, por cobrar y clientes en prueba.
- Gráfico de ingresos de los últimos 6 meses.
- Tabla de clientes con estado (al día, prueba, vencido, bloqueado, suspendido) y vencimiento.
- Registrar cobros (suma 1 mes y reactiva la cuenta), crear y editar clientes, suspender, eliminar.
- Link de pago por cliente (Mercado Pago u otro) y link de reservas para copiar.

**Panel del cliente (`/app`)** — lo que ve cada negocio:
- Turnos de hoy, agenda de 14 días, reservas web por confirmar y base de clientes.
- **Servicios y categorías propios** (ej: "Cortes", "Barba", "Combos"), cada uno con precio, duración y descripción. Se muestran en su link de reservas.
- Los horarios libres se ajustan a la duración: un servicio de 60 min ocupa dos casilleros de 30.
- **Recordatorios de turno por WhatsApp**: lista de turnos de hoy y mañana con un botón que abre WhatsApp con el mensaje listo (editable), y envío automático opcional.
- Ingresos del mes (turnos atendidos y por atender) y gasto de cada cliente.
- Ajustes de días de atención, horario, duración de los casilleros y WhatsApp del negocio.
- Su link público de reservas `/b/<negocio>` y el estado de su suscripción con botón de pago.

**Landing (`/`)** para vender el servicio y **registro propio (`/registro`)**: cada negocio crea su cuenta solo, elige su rubro y arranca la prueba gratis sin que vos hagas nada.

## Rubros

Al registrarse (o cuando lo creás desde tu panel) el negocio elige su tipo de negocio entre 18 opciones: barbería, peluquería, uñas y estética, kinesiología, psicología, nutrición, odontología, consultorio médico, veterinaria, taller mecánico, lavadero, academia de música, idiomas y apoyo escolar, gimnasio, pilates y yoga, tatuajes, fotografía y "otro". Eso carga:

- **Servicios y categorías sugeridos** (con precio en "Consultar" para que ponga el suyo).
- **Horario típico** del rubro.
- **Las palabras de su rubro** en el panel y en su página de reservas: *pacientes y sesiones*, *alumnos y clases*, *socios*, *trabajos*…

Después el negocio edita todo: agrega sus propias categorías, cambia precios y descripciones, o cambia de rubro desde Ajustes. Los rubros se definen en `src/config/rubros.js`: ahí agregás nuevos.

## Cómo funciona el cobro

1. El negocio se registra (o lo creás vos): arranca con **7 días de prueba** con todo habilitado.
2. Cuando te paga (transferencia, efectivo o Mercado Pago), tocás **Cobrar** y se suma un mes.
3. Si vence, tiene **5 días de gracia** con aviso y todo habilitado.
4. Pasada la gracia (o terminada la prueba sin pagar) entra en **modo solo lectura**: ve todos sus turnos, clientes y servicios, pero no puede cargar nada ni recibir reservas. Al pagar, sigue exactamente donde estaba, con todos sus datos.
5. Si vos lo suspendés manualmente, no puede hacer nada hasta que lo reactives.

Los cobros se registran a mano; no hay cobro automático con tarjeta. Se puede sumar la API de Mercado Pago después.

## Recordatorios por WhatsApp

**Manual (funciona siempre, sin costo):** en la pestaña *Hoy* aparecen los turnos de hoy y mañana. El botón "Recordar por WhatsApp" abre una conversación con el mensaje armado; el negocio solo toca enviar. Queda marcado como enviado. El mensaje se edita en *Ajustes* con `{nombre} {negocio} {servicio} {fecha} {hora}`.

**Automático (opcional):** envía solo, entre las 8 y las 21 hs, a los turnos que empiezan en las próximas 24 hs (y al menos 2 hs adelante). Usa la **WhatsApp Cloud API de Meta**:

1. Creá una cuenta en Meta for Developers con WhatsApp Business Platform y registrá un número.
2. Creá y hacé aprobar una **plantilla** (categoría *Utility*, idioma `es_AR`) con 5 variables:
   `Hola {{1}}! Te recordamos tu turno en {{2}}: {{3}} el {{4}} a las {{5}} hs. Si no podés venir, avisanos por acá.`
3. En el `.env` definí `WA_TOKEN`, `WA_PHONE_ID` y, si la nombraste distinto, `WA_TEMPLATE`.
4. Reiniciá el servidor. Cada cliente lo activa en *Ajustes → Recordatorios*.

Meta cobra por conversación según su tarifa vigente. Si un envío falla 3 veces, se deja de insistir y el panel muestra el error para mandarlo a mano. Con `WA_DRY_RUN=true` se simula el envío y solo escribe en la consola.

## Estructura

```
src/
  app.js                    servidor Express
  config/agendo.js          precio, días de prueba y gracia, tu WhatsApp
  model/database/           configuración de Sequelize y modelos (Negocio, Pago, Turno)
  routes/                   index, owner y app
  controllers/              dueño, clientes y reservas públicas
  services/                 suscripciones, cobros, métricas y horarios libres
  middlewares/              sesiones, suscripción activa y validación
  views/                    EJS: landing, panel del dueño, panel del cliente y reservas
public/                     CSS y JS del navegador
database/instalar.js        crea la base y las tablas
```

## Cómo correrlo

1. Tené MySQL o MariaDB encendido (por ejemplo, con XAMPP).
2. Instalá las dependencias:

```bash
npm install
```

3. Copiá `.env.example` como `.env` y completá `DB_PASSWORD`, `SESSION_SECRET` y `OWNER_PASSWORD` (la contraseña de tu panel).
4. Creá la base y las tablas:

```bash
npm run db:instalar
```

5. Iniciá el servidor:

```bash
npm start
```

Abrí http://localhost:3000, entrá a `/owner` con tu `OWNER_PASSWORD` y creá tu primer cliente. Precio, días de prueba, gracia y tu WhatsApp se editan en `src/config/agendo.js`.