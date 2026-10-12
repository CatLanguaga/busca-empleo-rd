# Revisión de mapeo con navegador

El detector (`descubrir.mjs`) trabaja por HTTP, y hay cosas que por HTTP no se ven: menús que arma JavaScript, portadas que rechazan a un script, enlaces acortados. La revisión de mapeo cubre ese hueco: una persona —o el asistente manejando un navegador, por ejemplo en Claude Cowork— abre el sitio del empleador y anota **dónde vive su bolsa de empleo y qué sistema la sirve**.

Así apareció la bolsa del Banco Popular: por HTTP su portada salía bloqueada; en el navegador, el enlace "Empleos" llevaba a `empleos.grupopopular.com`, que el escáner sí puede leer.

> Estado: este procedimiento se ejecutó con Claude en Chrome el 12 de octubre de 2026. El texto para Cowork de abajo **no está verificado dentro de Cowork**.

## Qué es y qué no es

- **Es** un reconocimiento, una vez por empleador: portada → enlace de empleo → a dónde lleva → qué sistema es.
- **No es** leer vacantes por navegador. Las vacantes las lee el escáner, y solo de portales cuyo `robots.txt` lo permite. El mapeo solo averigua a dónde mirar.
- **Sin CAPTCHAs ni inicios de sesión.** Si aparece uno, se anota "requiere verificación humana" y se pasa al siguiente.
- **Una visita por empleador**: la portada y, como mucho, dos páginas más. No se repite en bucle ni se programa.

## Cuándo hace falta

- Añadiste empleadores al registro y el detector no los resolvió.
- Un empleador que estaba resuelto dejó de estarlo (cambió de sistema o de dominio).
- Pasaron meses desde la última revisión.

## Pasos

### 1. Corre primero el detector

```bash
node descubrir.mjs ../career-ops --in data/empresas-rd.yml
```

Lo que salga `resuelta`, `tablero-vacio` o `cubierta` no necesita mapeo.

### 2. Revisa en el navegador los demás

Por cada empleador:

1. Abre su portada. Busca el enlace de empleo en el menú, el pie de página y "Sobre nosotros": *Trabaja con nosotros, Empleos, Vacantes, Carreras, Únete, Talento*. En sitios del Estado, también en Transparencia → Recursos Humanos.
2. Si no hay, mira una vez la página "Nosotros" o "Acerca de". Si tampoco, anota "sin enlace de empleo".
3. Si hay, ábrelo y anota la **URL final** y el **sistema**, si se reconoce: el dominio (`…teamtailor.com`, `…evaluar.com`, `…oraclecloud.com`) o lo que la página carga (los sitios de SuccessFactors cargan recursos de `rmkcdn.successfactors.com`).
4. Anota qué es realmente: listado de vacantes, formulario para dejar el CV, o remisión a Concursa, a redes o a un correo.

### 3. Escríbelo en el registro

En `data/empresas-rd.yml`, para ese empleador:

```yaml
empleo: https://portal-que-encontraste/     # solo si hay un portal de empleo
mapeo:
  fecha: 2026-10-12
  via: navegador
  sistema: "SAP SuccessFactors (sitio de marca)"   # o "propio", "Concursa", "desconocido"
  nota: "lo que viste, en una línea"
```

No toques `estado`, `donde`, `url` ni `vacantes`: los escribe el detector.

### 4. Vuelve a correr el detector

Con `empleo` puesto, el detector empieza por ese portal: lee su `robots.txt`, lo clasifica y, si hay lector, lo prueba. También comprueba que el lector no haya necesitado una ruta que el `robots.txt` del portal prohíbe; si la necesitó, el empleador **no** se da por resuelto.

Lo que resuelva se añade a `overlay/empresas.rd.yml` (o a `TENANTS` y `allowedHosts` si es de Evaluar). Después, `node install.mjs ../career-ops`.

## Texto para pegar en Cowork

Añade a Cowork las carpetas `career-ops` y `busca-empleo-rd`, con un navegador disponible, y pega:

> En `busca-empleo-rd/data/empresas-rd.yml` hay un registro de empleadores dominicanos. Quiero hacer la revisión de mapeo descrita en `busca-empleo-rd/docs/MAPEO.md`. Léelo primero y síguelo al pie de la letra.
>
> Trabaja solo con los empleadores cuyo `estado` no sea `resuelta`, `tablero-vacio` ni `cubierta` y que no tengan `mapeo` con `via: navegador`. Por cada uno: abre su `web` en el navegador, busca el enlace de empleo, ábrelo y anota la URL final y el sistema que reconozcas.
>
> Reglas: una visita por empleador, como mucho tres páginas. No leas ni copies vacantes. Si aparece un CAPTCHA, una verificación de "no soy un robot" o un inicio de sesión, no lo resuelvas: anota "requiere verificación humana" y sigue con el siguiente. No uses ninguna cuenta.
>
> Al terminar, muéstrame una tabla con lo hallado y los cambios que propones al registro (`empleo` y `mapeo`, nada más). No escribas el archivo hasta que yo lo apruebe. Luego corre `node descubrir.mjs ../career-ops --in data/empresas-rd.yml` desde `busca-empleo-rd` y dime qué cambió.

## Lo que encontró la primera revisión

22 empleadores revisados en navegador el 12 de octubre de 2026. Detalle en el registro y en [EMPRESAS.md](EMPRESAS.md).

| Hallazgo | Empleadores |
|---|---|
| Portal hallado y legible por el escáner | Banco Popular |
| Portal hallado, legible, pero no útil para RD | MAPFRE BHD (portal global del grupo) |
| Portal hallado; su `robots.txt` prohíbe la ruta del listado | Claro, APAP |
| Portal propio sin lector | Banco BHD |
| Solo formulario para dejar el CV | Grupo Puntacana, Superintendencia de Bancos |
| Remite a Concursa (ya cubierta) | Superintendencia del Mercado de Valores |
| Sin enlace de empleo tampoco en navegador | Banreservas, Scotiabank, Banesco, Banco Santa Cruz, Banco Caribe, Asociación Cibao, Seguros Reservas, Altice, Edesur, Grupo Rica, Farmacia Carol, Superintendencia de Pensiones, INDOTEL |
| Portal que no respondió | Cámara de Cuentas |

Lección: el navegador encontró portales que HTTP no veía (Popular, BHD, Mercado de Valores), pero **la mayoría de los "sin enlace" lo siguen siendo**. Esos empleadores no publican vacantes en su web; hay que buscarlos en Computrabajo, LinkedIn o sus redes.
