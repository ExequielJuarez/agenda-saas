# Agendo — micro-app de turnos por suscripción

Sistema para ofrecer una agenda de turnos como servicio: **vos cobrás una suscripción mensual** ($25.000 por defecto) y cada cliente tiene su propio panel.

## Qué incluye

**Panel del dueño (`/owner`)** — el tuyo:
- Ingreso mensual recurrente (MRR), cobrado del mes, histórico, por cobrar y clientes en prueba.
- Gráfico de ingresos de los últimos 6 meses.
- Tabla de clientes con estado (al día, prueba, vencido, bloqueado, suspendido) y vencimiento.
- Registrar cobros (suma 1 mes y reactiva la cuenta), crear/editar clientes, suspender, eliminar.
- Link de pago por cliente (Mercado Pago u otro) y link de reservas para copiar.

**Panel del cliente (`/app`)** — lo que ve cada negocio:
- Turnos de hoy, agenda de 14 días, reservas web por confirmar y base de clientes.
- Ajustes de días, horarios, duración de turnos y servicios.
- Su link público de reservas `/b/<negocio>` y el estado de su suscripción con botón de pago.

**Landing (`/`)** para vender el servicio.

## Cómo funciona el cobro

1. Creás al cliente desde tu panel: arranca con **14 días de prueba**.
2. Cuando te paga (transferencia, efectivo o Mercado Pago), tocás **Cobrar** y se suma un mes.
3. Si vence, tiene **5 días de gracia** con aviso; después la cuenta se pausa (los datos se conservan) hasta que pague.

Los cobros se registran a mano; no hay cobro automático con tarjeta. Se puede sumar la API de Mercado Pago después.

## Cómo correrlo

```bash
OWNER_PASSWORD="tu-clave-segura" node server.js
```

Abrí http://localhost:3000. Precio, días de prueba, gracia y tu WhatsApp se editan en `config.json`. Requiere Node.js 18+, sin dependencias; los datos van a `data/db.json` (necesita almacenamiento persistente al publicarlo).
