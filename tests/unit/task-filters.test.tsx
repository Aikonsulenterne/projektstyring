import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaskFilters } from '@/components/filters/TaskFilters';
import { EMPTY_FILTERS } from '@/domain/selectors';
import { demoAreas, demoMembers, DEMO_IDS } from '@/demo/seed';

describe('<TaskFilters>', () => {
  it('renders labelled native controls with explicit "none" options and the matching count', async () => {
    const onChange = vi.fn();
    render(
      <TaskFilters filters={EMPTY_FILTERS} onChange={onChange} onReset={() => {}} members={demoMembers()} areas={demoAreas()} projects={[]} count={3} canReset={false} />,
    );
    expect(screen.getByText('3 opgaver matcher')).toBeInTheDocument();
    const area = screen.getByLabelText('Område');
    expect(screen.getByRole('option', { name: 'Uden område' })).toHaveValue('none');
    await userEvent.selectOptions(area, 'Model');
    expect(onChange).toHaveBeenCalledWith({ areaId: DEMO_IDS.areaModel });
    expect(screen.getByRole('button', { name: 'Nulstil' })).toBeDisabled();
  });

  it('hides the project filter inside a project route', () => {
    render(
      <TaskFilters filters={EMPTY_FILTERS} onChange={() => {}} onReset={() => {}} members={demoMembers()} areas={demoAreas()} projects={[]} showProject={false} count={1} canReset />,
    );
    expect(screen.queryByLabelText('Projekt')).toBeNull();
    expect(screen.getByText('1 opgave matcher')).toBeInTheDocument();
  });
});
