# LinkedIn

En República Dominicana mucha contratación profesional pasa por LinkedIn: multinacionales, banca, tecnología, zonas francas, y casi todo el trabajo remoto para empresas de fuera. Varios de los empleadores que en el [registro](EMPRESAS.md) salen "sin enlace de empleo en su web" publican ahí.

busca-empleo-rd **no rastrea LinkedIn**, pero sí lo usa. Estas son las cuatro formas, de menos a más montaje.

## 1. Pegar la oferta

La más simple y la que siempre funciona. Encuentras una oferta en LinkedIn y se la das al asistente:

> Evalúa esta oferta: https://www.linkedin.com/jobs/view/1234567890

career-ops intenta abrirla **una vez** en el navegador. LinkedIn a menudo no muestra la descripción a un navegador automatizado; si pasa, el asistente te pide que **pegues el texto** de la oferta. Pégalo y sigue normal: evaluación, CV, carta.

Dos cosas que hace career-ops con ofertas de LinkedIn, y conviene saber:

- Las trata como **sin confirmar** hasta ver la misma vacante en la página del empleador. LinkedIn deja ofertas viejas publicadas mucho después de cerradas.
- Si la encuentra en la web del empleador, usa ese enlace como el bueno y aplicas ahí.

## 2. Alertas de LinkedIn → tu correo → tu pipeline

Para no entrar a buscar cada día. LinkedIn te manda las ofertas; career-ops las recoge de tu correo.

1. En LinkedIn, busca empleos con **ubicación "República Dominicana"** y tus palabras clave, y activa la **alerta de empleo** de esa búsqueda (diaria o semanal, por correo). Repite con "Remoto" si te interesa.
2. En Gmail, crea una etiqueta (por ejemplo `Empleo`) y un filtro que se la ponga a los correos de alertas de LinkedIn.
3. Activa el plugin `gmail` de career-ops, que lee esa etiqueta y pasa los enlaces de ofertas a `data/pipeline.md`:
   ```yaml
   # config/plugins.yml
   plugins:
     gmail: { enabled: true, label: "Empleo", days_back: 7 }
   ```
   ```bash
   node plugins.mjs skill gmail      # cómo configurarlo
   node plugins.mjs run gmail        # traer las ofertas nuevas
   ```
   Necesita credenciales OAuth de Google en tu `.env` (las creas tú, en tu propia cuenta; el plugin solo lee esa etiqueta). Es el paso con más montaje; el asistente te puede guiar.
4. Después: *"procesa mi pipeline"*.

LinkedIn te envía esos correos porque tú se lo pediste; leerlos en tu propia bandeja no es rastrear su sitio.

> No hemos probado este flujo de punta a punta con alertas de LinkedIn en español. El plugin `gmail` es de career-ops y está pensado para correos de alertas; si algo no cuadra, abre un issue.

Sin Gmail o sin ganas de configurar OAuth: abre el correo de la alerta y pega los enlaces que te interesen (forma 1).

## 3. ¿Conozco a alguien ahí?

En un mercado pequeño, una referencia pesa más que una postulación fría. career-ops cruza tus contactos de LinkedIn con las empresas que sigues, sin conectarse a LinkedIn:

1. LinkedIn → Configuración → Privacidad de datos → **Obtener una copia de tus datos** → elige solo **Conexiones**.
2. Pon el `Connections.csv` que te envían en `career-ops/data/`.
3. ```bash
   node linkedin-join.mjs --summary
   ```

Lista a quién conoces en cada empresa de tu seguimiento y de tus portales. Guía completa: `docs/LINKEDIN_JOIN.md` de career-ops.

## 4. Escribirle a la persona correcta

> Usa el modo contacto para esta oferta.

El asistente identifica a quién escribir (reclutador, jefe del área, alguien del equipo) y **redacta** el mensaje dentro del límite de caracteres de una invitación de LinkedIn. No lo envía: lo copias y lo mandas tú.

## Por qué no hay un lector de LinkedIn

Los términos de LinkedIn prohíben el acceso automatizado a su sitio, y career-ops rechaza expresamente las integraciones que lo hacen. busca-empleo-rd sigue esa línea por tres razones prácticas:

- **Tu cuenta.** LinkedIn restringe cuentas y direcciones que detecta rastreando. Tu perfil es justo lo que no quieres perder mientras buscas trabajo.
- **Se rompe.** Esos lectores dependen de páginas que LinkedIn cambia sin aviso.
- **No hace falta.** Con alertas por correo recibes las mismas ofertas, enviadas por LinkedIn.

Tampoco se le pide al asistente que recorra LinkedIn "a mano" en un navegador de forma repetida: es lo mismo con otro disfraz.
