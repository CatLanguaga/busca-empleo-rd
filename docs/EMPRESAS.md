# Empresas e instituciones dominicanas

Muchos empleadores dominicanos tienen su propia bolsa de empleo: el Banco Popular, Grupo Universal, la Cervecería. busca-empleo-rd trae un **detector** que encuentra esas bolsas partiendo de la web de cada empleador, y un **registro** con lo que encontró.

## Por qué un detector propio

career-ops trae `discover-ats.mjs`, que adivina un identificador a partir del **nombre** de la empresa y lo prueba en una docena de sistemas de vacantes. Con 20 empleadores dominicanos resolvió 0.

`descubrir.mjs` hace lo que haría una persona: abre la **web** del empleador, sigue el enlace "Trabaja con nosotros / Empleos / Vacantes" y mira a dónde lleva.

## Cómo funciona

Por cada empleador:

1. Lee su `robots.txt` y lo respeta ruta por ruta.
2. Abre la portada y busca el enlace de empleo. En sitios `.gob.do` / `.gov.do`, si no lo hay, busca en la sección de transparencia (Recursos Humanos → Vacantes).
3. Sigue ese enlace y clasifica el destino.
4. Si el destino es un sistema legible, **lo lee en ese momento** y solo lo da por resuelto si devuelve al menos una vacante. Muestra tres títulos para que veas que es la empresa correcta.

Límites fijos: 6 peticiones por empleador, un segundo entre peticiones, sin reintentos. Si un sitio bloquea accesos automáticos, lo reporta como bloqueado y sigue; no intenta saltarlo.

## Qué puede salir

| Estado | Qué significa | Qué hacer |
|---|---|---|
| `resuelta` | Su bolsa usa un sistema que el escáner lee, y hoy lista vacantes | Nada: ya viene en busca-empleo-rd, o se añade con `--write` |
| `tablero-vacio` | Sistema legible, hoy con 0 vacantes | Viene incluida; aparecerán cuando publiquen |
| `cubierta` | Publica en Concursa o RD Trabaja, que busca-empleo-rd ya lee | Nada |
| `evaluar-nuevo` | Usa Evaluar pero su sitio no está en el plugin | Abrir un issue para añadirlo |
| `plataforma` | Remite a algo que no se puede leer (ver abajo) | Revisar a mano |
| `portal-externo` | Tiene portal de empleo en otro dominio, sin lector | Revisar a mano; candidato a un lector nuevo |
| `pagina-propia` | Lista vacantes en una página de su propia web | Revisar a mano |
| `sin-enlace` | No se encontró enlace de empleo en la portada | Buscar a mano; suelen publicar en bolsas o redes |
| `bloqueada` | El sitio rechaza accesos automáticos | Revisar en el navegador |
| `robots` | Su `robots.txt` no permite leer esa ruta | Revisar en el navegador |
| `sin-respuesta` | El sitio no respondió | Reintentar otro día |

## Lo que encontramos

Pasada del **12 de octubre de 2026** sobre 40 empleadores: detector por HTTP más revisión en navegador de los que no resolvió. Detalle completo, con URL y notas, en [`data/empresas-rd.yml`](../data/empresas-rd.yml). Es una foto de ese día: los sitios cambian.

### Resueltas (ya incluidas en busca-empleo-rd)

| Empleador | Sistema | Vacantes ese día |
|---|---|---|
| Banco Popular Dominicano | SAP SuccessFactors (`empleos.grupopopular.com`) | 41 |
| Grupo SID | Evaluar | 68 |
| Grupo Universal | Oracle Cloud | 37 |
| Grupo InterEnergy (CEPM) | Teamtailor | 29 |
| Cervecería Nacional Dominicana | Teamtailor | 11 |
| Humano Seguros | Evaluar | 0 (incluida igual) |

Notas:

- **Banco Popular:** su web principal (`popularenlinea.com`) bloquea accesos automáticos. Su bolsa de empleo vive en otro dominio, que sí permite la lectura de listados. Por eso el registro guarda ese portal en el campo `empleo`.
- **CEPM:** el portal es el del grupo InterEnergy, su casa matriz. Puede incluir vacantes fuera de RD.

### Sector público

| Institución | Resultado |
|---|---|
| Aduanas, Contraloría General | Remiten a **Concursa**, que busca-empleo-rd ya lee |
| Ministerio de Trabajo | Remite a **RD Trabaja**, que busca-empleo-rd ya lee |
| Superintendencia de Bancos | Página propia: `sb.gob.do/sobre-nosotros/unete-a-nuestro-equipo/`. Vista en navegador: es un formulario de empleo con correos de reclutamiento; no se vio listado de vacantes |
| Banco Central | Página propia de vacantes, en su sección de transparencia |
| TSS, Junta Central Electoral, DGII, Superintendencia de Seguros, Ministerio de Hacienda | Página propia (transparencia / recursos humanos) |
| Cámara de Cuentas | Portal propio: `convocatorias.camaradecuentas.gob.do` |
| Superintendencia de Pensiones, INDOTEL | Sin enlace de empleo visible |
| Superintendencia del Mercado de Valores | Bloqueado por HTTP. En navegador: su menú de Recursos Humanos remite a **Concursa** |

**Concursa** (`map.gob.do/Concursa/`) es la fuente que más rinde para el Estado: un solo listado con los concursos de las instituciones que publican por ahí, cada uno con la institución convocante, plazas, salario y fecha límite. El día de la pasada había 1 concurso abierto y 19 cerrados en la primera página: el volumen es bajo y va por temporadas.

Las instituciones con página propia no tienen lector todavía. Están en el registro con su enlace para revisarlas a mano.

### Sin lector

| Empleador | Por qué |
|---|---|
| EGE Haina, Grupo Ramos, APAP | Usan el portal clásico de SAP SuccessFactors (`career*.successfactors.com`, `career*.sapsf.com`), cuyo `robots.txt` es `Disallow: /`. No se lee. |
| Claro | Portal `vacantes.claro.com.do`, SuccessFactors con el buscador nuevo. El listado solo sale por `/services/…`, que su `robots.txt` prohíbe. No se incluye. |
| MAPFRE BHD | Portal `jobs.mapfre.com`, legible, pero es el global del grupo: de 99 vacantes leídas ninguna identificada en RD. No se incluye. |
| Banco BHD | Portal propio `empleosbhd.com.do` (hallado en navegador tras un enlace acortado). Carga con JavaScript; sin lector. |
| Grupo Puntacana | Su portal es un formulario de solicitud; no lista vacantes. |
| Edenorte, Caribbean Cinemas | Página propia en su web |
| Banreservas, Scotiabank, Banesco, Banco Santa Cruz, Banco Caribe, Asociación Cibao, Seguros Reservas, Altice, Edesur, Grupo Rica, Farmacia Carol | Sin enlace de empleo en la portada, tampoco vista en navegador |

Estos resultados combinan el detector con una [revisión de mapeo en navegador](MAPEO.md) de 22 empleadores. La columna `mapeo.via` del registro dice cuál de las dos vías vio cada cosa.

El detector comprueba además que el lector no haya usado una ruta prohibida por el `robots.txt` del portal. Así se descartó Claro, que de otro modo habría contado como resuelta.

Para mirar estos empleadores con el asistente, uno por uno y desde un navegador, ver [COWORK.md](COWORK.md#5-empleadores-que-el-escáner-no-lee).

"Sin enlace en la portada" no significa que no contraten: significa que el detector no vio un enlace reconocible. Muchas publican en Computrabajo, que busca-empleo-rd ya lee por palabra clave.

## Usar el detector

Desde la carpeta de busca-empleo-rd, apuntando a tu carpeta de career-ops:

```bash
# Una empresa
node descubrir.mjs ../career-ops "Nombre de la empresa=https://www.su-sitio.com.do"

# Todo el registro
node descubrir.mjs ../career-ops --in data/empresas-rd.yml

# Guardar en tu portals.yml las que resolvieron
node descubrir.mjs ../career-ops "Empresa=https://sitio" --write
```

Por defecto solo muestra. Con `--write` añade a `tracked_companies` las que usan un sistema que career-ops lee, sin duplicar, y deja copia `portals.yml.bak`.

Si ya sabes cuál es el portal de empleo de una empresa, pásalo directamente como sitio: el detector empieza por ahí.

O pídeselo al asistente: *"usa descubrir.mjs de busca-empleo-rd para ver dónde publica vacantes <empresa> (<web>)"*.

### Comprobar después

```bash
node audit-portals.mjs --summary     # en career-ops: vacantes y títulos de muestra por empresa
```

Si los títulos no parecen de esa empresa o de RD, quita la entrada.

## Proponer un empleador para el registro

Abre un issue o PR añadiendo a `data/empresas-rd.yml` solo `nombre`, `sector` y `web` (y `empleo` si conoces su portal). El `estado` no se escribe a mano: sale de correr el detector.

Para una empresa nueva en **Evaluar** (`{empresa}.evaluar.com`): hay que añadir su sitio a `TENANTS` en `plugins/rd-boards/_evaluar.mjs` y a `allowedHosts` en `manifest.json`, porque el motor de plugins de career-ops solo permite hosts declarados uno por uno.
