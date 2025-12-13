import { describe, it, expect } from 'vitest';

describe('Inspections Selection Logic', () => {
  it('should filter displayed inspections based on showAll flag', () => {
    const mockInspections = [
      { id: 1, createdAt: new Date('2025-12-10') },
      { id: 2, createdAt: new Date('2025-12-09') },
      { id: 3, createdAt: new Date('2025-12-08') },
      { id: 4, createdAt: new Date('2025-12-07') },
      { id: 5, createdAt: new Date('2025-12-06') },
      { id: 6, createdAt: new Date('2025-12-05') },
    ];

    // Simular lógica do useMemo
    const getDisplayedInspections = (inspections: any[], showAll: boolean) => {
      const sortedInspections = [...inspections].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA; // Mais recente primeiro
      });
      return showAll ? sortedInspections : sortedInspections.slice(0, 4);
    };

    // Teste 1: Últimas 4
    const displayedLast4 = getDisplayedInspections(mockInspections, false);
    expect(displayedLast4).toHaveLength(4);
    expect(displayedLast4.map(i => i.id)).toEqual([1, 2, 3, 4]); // Mais recentes

    // Teste 2: Mostrar Todas
    const displayedAll = getDisplayedInspections(mockInspections, true);
    expect(displayedAll).toHaveLength(6);
    expect(displayedAll.map(i => i.id)).toEqual([1, 2, 3, 4, 5, 6]);

    console.log('✅ Filtro "Últimas 4" retorna 4 vistorias mais recentes');
    console.log('✅ Filtro "Mostrar Todas" retorna todas as 6 vistorias');
  });

  it('should select only displayed inspections when toggling select all', () => {
    const displayedInspections = [
      { id: 1 },
      { id: 2 },
      { id: 3 },
      { id: 4 },
    ];

    // Simular lógica do toggleSelectAll
    const toggleSelectAll = (
      currentSelection: number[],
      displayed: any[]
    ): number[] => {
      const displayedIds = displayed.map(i => i.id);
      const allDisplayedSelected = displayedIds.every(id => currentSelection.includes(id));

      if (allDisplayedSelected) {
        // Desmarcar apenas as exibidas
        return currentSelection.filter(id => !displayedIds.includes(id));
      } else {
        // Selecionar apenas as exibidas
        const newSelection = [...currentSelection];
        displayedIds.forEach(id => {
          if (!newSelection.includes(id)) {
            newSelection.push(id);
          }
        });
        return newSelection;
      }
    };

    // Teste 1: Selecionar todas (de vazio)
    let selection: number[] = [];
    selection = toggleSelectAll(selection, displayedInspections);
    expect(selection).toEqual([1, 2, 3, 4]);
    console.log('✅ Selecionar todas: [] → [1, 2, 3, 4]');

    // Teste 2: Desmarcar todas
    selection = toggleSelectAll(selection, displayedInspections);
    expect(selection).toEqual([]);
    console.log('✅ Desmarcar todas: [1, 2, 3, 4] → []');

    // Teste 3: Selecionar com algumas já selecionadas
    selection = [1, 2];
    selection = toggleSelectAll(selection, displayedInspections);
    expect(selection).toEqual([1, 2, 3, 4]);
    console.log('✅ Selecionar com parciais: [1, 2] → [1, 2, 3, 4]');

    // Teste 4: Não desmarcar itens de FORA do filtro
    selection = [1, 2, 3, 4, 5, 6]; // 5 e 6 estão fora do filtro
    selection = toggleSelectAll(selection, displayedInspections);
    expect(selection).toEqual([5, 6]); // Mantém 5 e 6, remove 1-4
    console.log('✅ Desmarcar respeitando filtro: [1, 2, 3, 4, 5, 6] → [5, 6]');
  });
});
