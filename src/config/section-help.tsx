export const sectionHelp = {
  empleadosActivos: {
    title: 'Empleados Activos',
    body: 'Total de empleados con estado activo en el sistema. El footer muestra el desglose de inactivos y el total de la plantilla registrada. Los inactivos son empleados dados de baja.'
  },
  flotaAsignada: {
    title: 'Flota Asignada',
    body: 'Suma de celulares (líneas móviles) y laptops actualmente asignadas a empleados. No incluye equipos en stock, en reparación o dados de baja — solo los que están en uso activo.'
  },
  masaSalarialARS: {
    title: 'Masa Salarial ARS',
    body: 'Suma total de todos los sueldos en pesos argentinos del último mes con datos cargados. El porcentaje compara contra el mes anterior: verde si subió, rojo si bajó. Si no hay mes anterior para comparar, no se muestra el delta.'
  },
  masaSalarialUSD: {
    title: 'Masa Salarial USD',
    body: 'Suma total de todos los sueldos en dólares del último mes con datos cargados. Solo incluye empleados que cobran en USD según la tabla de sueldos.'
  },
  masaSalarialChart: {
    title: 'Evolución Masa Salarial',
    body: 'Gráfico de área que muestra cómo evolucionó la masa salarial total en pesos argentinos durante los últimos 6 meses con datos. Cada punto del eje vertical representa la suma de todos los sueldos ARS de ese mes.'
  },
  proximosEventos: {
    title: 'Próximos Eventos',
    body: 'Reuniones programadas y cumpleaños de empleados activos en los próximos 14 días. Las reuniones llevan ícono violeta y los cumpleaños rosa. Los eventos a 1 día o menos tienen fondo ámbar como alerta urgente. Se muestran hasta 8 eventos ordenados por cercanía.'
  },
  empleadosPorEquipo: {
    title: 'Empleados por Equipo',
    body: 'Gráfico de barras que muestra cuántos empleados hay en cada equipo o área de ingreso. La primera barra son empleados activos y la segunda inactivos. Ordenado por cantidad de activos de mayor a menor.'
  },
  modalidadTrabajo: {
    title: 'Modalidad de Trabajo',
    body: 'Gráfico de torta con la distribución de empleados activos según su modalidad laboral (Presencial, Home Office o Híbrido). El dato sale de la columna modalidad de cada empleado. Si un empleado no tiene modalidad cargada, aparece con su valor sin procesar.'
  },
  vacacionesRanking: {
    title: 'Saldo de Vacaciones',
    body: 'Ranking de empleados activos con su saldo de días de vacaciones para 2025. Cada barra muestra visualmente la proporción respecto al mayor saldo. Los colores indican criticidad: rojo si no le quedan días, ámbar si le quedan 3 o menos, y verde si tiene 4 o más. Ordenados de mayor a menor saldo.'
  },
  legajo: {
    title: 'Legajo de Empleados',
    sections: [
      {
        title: 'Vista general',
        description:
          'Tabla con todos los empleados registrados. Podés buscar por nombre, filtrar por equipo, ordenar por cualquier columna y editar campos directamente desde la tabla (inline).'
      },
      {
        title: 'Acciones',
        description:
          'Crear nuevo empleado, editar datos personales y laborales, ver el detalle completo de cada empleado (datos, sueldos, vacaciones, modalidad), y dar de baja. Toda eliminación pide confirmación y permite deshacer.'
      },
      {
        title: 'Columnas',
        description:
          'Nombre, apellido, email, teléfono, documento, fecha de ingreso, equipo, puesto, modalidad, fecha de baja. Las columnas se pueden mostrar u ocultar desde el selector de la tabla.'
      }
    ]
  },
  payroll: {
    title: 'Sueldos',
    sections: [
      {
        title: 'Vista general',
        description:
          'Histórico de sueldos mensuales de cada empleado, tanto en pesos argentinos (ARS) como en dólares (USD). Organizado en un acordeón por empleado.'
      },
      {
        title: 'Cómo funciona',
        description:
          'Cada empleado tiene su panel expandible. Adentro se muestran dos tablas separadas: una para sueldos en ARS y otra para sueldos en USD. Cada fila representa un mes y año con el monto correspondiente.'
      },
      {
        title: 'Bonos anuales',
        description:
          'Además del sueldo mensual, cada empleado puede tener un bono anual registrado. Aparece como una tarjeta separada dentro del panel del empleado.'
      },
      {
        title: 'Importar desde Sheets',
        description:
          'Usá el botón "Importar desde Google Sheets" para cargar sueldos desde una planilla. El sistema detecta automáticamente la moneda y el período de cada pestaña.'
      }
    ]
  },
  calendario: {
    title: 'Calendario',
    sections: [
      {
        title: 'Vista general',
        description:
          'Vista de calendario mensual que consolida licencias, vacaciones, días de estudio, ausencias, mudanzas, cumpleaños y reuniones. Cada tipo de evento tiene su propio color.'
      },
      {
        title: 'Filtros y leyenda',
        description:
          'Podés filtrar por tipo de evento y por empleado para ver solo lo que te interesa. La leyenda indica qué significa cada color.'
      },
      {
        title: 'Origen de datos',
        description:
          'Los eventos se obtienen desde Supabase mediante una función RPC que cruza datos de vacaciones, eventos del calendario y cumpleaños de empleados activos.'
      }
    ]
  },
  flota: {
    title: 'Flota de Equipos',
    sections: [
      {
        title: 'Celulares',
        description:
          'Líneas móviles asignadas a empleados. Muestra número, rol, usuario, equipo y estado (asignado, disponible, baja). Podés reordenar con las flechas, crear, editar y eliminar.'
      },
      {
        title: 'Laptops',
        description:
          'Equipos portátiles asignados. Muestra marca, modelo, número de serie, usuario asignado, equipo y estado. Podés crear, editar y eliminar registros.'
      },
      {
        title: 'Deshacer',
        description:
          'Ambas tablas permiten deshacer durante 15 segundos cualquier creación o eliminación. Las ediciones de legajo también tienen undo.'
      }
    ]
  },
  documentos: {
    title: 'Documentos',
    sections: [
      {
        title: 'Vista general',
        description:
          'Repositorio de archivos asociados a empleados, celulares y notebooks. Cada documento muestra su archivo, tipo, etiqueta y a quién está asociado.'
      },
      {
        title: 'Subir documentos',
        description:
          'Arrastrá y soltá archivos PDF, Word o imágenes sobre la zona de carga. Seleccioná si el documento se asocia a un empleado, celular o notebook. Asignale una etiqueta (Legal, Contable, RRHH, Contrato, Seguro) para filtrar después.'
      },
      {
        title: 'Descargar y eliminar',
        description:
          'Clic en el ícono de descarga para bajar el archivo. Clic en el ícono de eliminar para borrarlo. La eliminación permite deshacer durante 15 segundos; vencido ese plazo, el archivo se purga del storage.'
      }
    ]
  }
};
