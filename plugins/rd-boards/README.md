# rd-boards

Plugin de [career-ops](https://github.com/career-ops-hq/career-ops) que lee bolsas de empleo de República Dominicana: Computrabajo RD, Tecoloco RD, DiarioEmpleo, RD Trabaja, Concursa, Unika y los empleadores alojados en Evaluar.

Parte de [busca-empleo-rd](../../README.md). Uso y configuración en [`skill.md`](skill.md).

```bash
node plugins/rd-boards/test/smoke.mjs   # prueba sin red
```

## Créditos

- Contrato de plugin, motor, guardia de red y escáner: **career-ops**, de Santiago Fernández de Valderrama y colaboradores (MIT).
- La forma de los parsers (regex sobre tarjetas, sin dependencias) sigue el CLI `linkedin-search` de **ai-job-search**, de Mads Lorentzen (MIT). No se copió código de ese CLI en este plugin.

Licencia: MIT. Ver [`LICENSE`](LICENSE).
