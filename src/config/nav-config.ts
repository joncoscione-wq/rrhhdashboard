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
    label: 'Panel',
    items: [
      {
        title: 'Resumen',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['d', 'd'],
        items: []
      },
      {
        title: 'Calendario',
        url: '/dashboard/calendario',
        icon: 'calendar',
        isActive: false,
        shortcut: ['c', 'c'],
        items: []
      }
    ]
  },
  {
    label: 'Gestión',
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
        title: 'Flota',
        url: '/dashboard/flota/celulares',
        icon: 'mobile',
        isActive: false,
        shortcut: ['f', 'f'],
        items: [
          { title: 'Celulares', url: '/dashboard/flota/celulares', shortcut: ['f', 'c'] },
          { title: 'Laptops', url: '/dashboard/flota/laptops', shortcut: ['f', 'l'] }
        ]
      },
      {
        title: 'Documentos',
        url: '/dashboard/documents',
        icon: 'documents',
        isActive: false,
        shortcut: ['d', 'o'],
        items: []
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
  }
];
