import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: 'Asistente',
    items: [
      {
        title: 'Asistente IA',
        url: '/dashboard/assistant',
        icon: 'sparkles',
        isActive: false,
        shortcut: ['a', 'i'],
        items: []
      }
    ]
  },
  {
    label: 'Panel Principal',
    items: [
      {
        title: 'Resumen',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['d', 'd'],
        items: []
      }
    ]
  },
  {
    label: 'Gestión de Personas',
    items: [
      {
        title: 'Legajo',
        url: '/dashboard/legajo',
        icon: 'legajo',
        isActive: false,
        shortcut: ['l', 'l'],
        items: []
      },
      {
        title: 'Calendario',
        url: '/dashboard/calendario',
        icon: 'calendar',
        isActive: false,
        shortcut: ['c', 'c'],
        items: []
      },
      {
        title: 'People',
        url: '/dashboard/people',
        icon: 'talent',
        isActive: false,
        shortcut: ['t', 't'],
        items: [
          { title: 'Reuniones', url: '/dashboard/people/reuniones', shortcut: ['r', 'r'] },
          { title: 'Manuales', url: '/dashboard/people/manuales', shortcut: ['m', 'm'] }
        ]
      },
      {
        title: 'Sueldos',
        url: '/dashboard/payroll',
        icon: 'payroll',
        isActive: false,
        shortcut: ['s', 's'],
        items: []
      }
    ]
  },
  {
    label: 'Administración',
    items: [
      {
        title: 'Flota',
        url: '/dashboard/flota/celulares',
        icon: 'mobile',
        isActive: false,
        shortcut: ['f', 'f'],
        items: [
          { title: 'Flota de Celulares', url: '/dashboard/flota/celulares', shortcut: ['f', 'c'] },
          { title: 'Flota de Laptops', url: '/dashboard/flota/laptops', shortcut: ['f', 'l'] }
        ]
      },
      {
        title: 'Expedientes',
        url: '/dashboard/documents',
        icon: 'documents',
        isActive: false,
        shortcut: ['e', 'e'],
        items: []
      }
    ]
  },
  {
    label: 'Integraciones',
    items: [
      {
        title: 'Google Sheets',
        url: '/dashboard/google-sheets',
        icon: 'sheets',
        isActive: false,
        shortcut: ['g', 's'],
        items: []
      }
    ]
  },
  {
    label: 'Configuración',
    items: [
      {
        title: 'Notificaciones',
        url: '/dashboard/notifications',
        icon: 'notification',
        isActive: false,
        shortcut: ['n', 'n'],
        items: []
      },
      {
        title: 'Configuración',
        url: '/dashboard/settings',
        icon: 'settings',
        isActive: false,
        shortcut: ['c', 'f'],
        items: []
      }
    ]
  }
];
