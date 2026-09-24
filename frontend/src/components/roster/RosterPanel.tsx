// The roster drawer (AC30, AC31, AC35, AC41), shown while `state.rosterOpen` is true: people in
// order, an add form with a colour picker, inline rename, recolour and confirmed removal.
// Every change goes through the store, so bars pick up new names and colours from the server's
// ProjectDetail with no reload.
import "../../styles/roster.css";
import { type FormEvent, type JSX, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { PaletteColour, Person, ProjectDetail } from "../../api/types.ts";
import { useActions, useAppState } from "../../state/store.tsx";
import { ColourPicker, defaultColour } from "./ColourPicker.tsx";

function tasksPhrase(count: number): string {
  return count === 1 ? "1 task will" : `${count} tasks will`;
}

function colourName(colours: PaletteColour[], fill: string): string {
  return colours.find((c) => c.fill === fill)?.name ?? fill;
}

function AddPersonForm(props: { people: Person[]; colours: PaletteColour[] }) {
  const actions = useActions();
  const [name, setName] = useState("");
  // null follows the "first unused colour" default; a click pins a choice until the next add.
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const colour =
    picked ??
    defaultColour(
      props.colours,
      props.people.map((p) => p.colour),
    );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) {
      return;
    }
    setBusy(true);
    // No client-side name checks: the server owns the rules and explains them (AC30, AC40).
    const result = await actions.createPerson(colour === null ? { name } : { name, colour });
    setBusy(false);
    if (result.ok) {
      setName("");
      setPicked(null);
    }
    inputRef.current?.focus();
  }

  return (
    <form data-testid="roster-add-form" className="roster-add" onSubmit={submit}>
      <h3 className="roster-section-title">Add a person</h3>
      <div className="roster-add-row">
        <input
          ref={inputRef}
          data-testid="person-name-input"
          className="roster-input"
          value={name}
          placeholder="Name"
          aria-label="New person's name"
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="submit"
          data-testid="person-add"
          className="button button-primary"
          disabled={busy}
        >
          Add
        </button>
      </div>
      <ColourPicker
        colours={props.colours}
        value={colour}
        label="Colour for the new person"
        onChange={setPicked}
      />
    </form>
  );
}

function PersonRow(props: { person: Person; taskCount: number; colours: PaletteColour[] }) {
  const { person, taskCount, colours } = props;
  const actions = useActions();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(person.name);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // True only while the rename input is live, so Enter and the blur that follows it send one
  // request, and Escape's unmount blur sends none.
  const editing = useRef(false);

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  function startRename() {
    editing.current = true;
    setDraft(person.name);
    setRenaming(true);
  }

  async function commitRename() {
    if (!editing.current) {
      return;
    }
    editing.current = false;
    if (draft !== person.name) {
      // On failure the store shows the server message, and the row falls back to the stored name.
      await actions.updatePerson(person.id, { name: draft });
    }
    setRenaming(false);
  }

  function onRenameKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      editing.current = false;
      setRenaming(false);
    }
  }

  async function recolour(fill: string) {
    setPickerOpen(false);
    if (fill !== person.colour) {
      await actions.updatePerson(person.id, { colour: fill });
    }
  }

  async function remove() {
    const confirmed = await actions.confirm({
      title: "Remove person",
      message: `Remove "${person.name}"? ${tasksPhrase(taskCount)} become unassigned.`,
      confirmLabel: "Remove",
    });
    if (confirmed) {
      await actions.deletePerson(person.id);
    }
  }

  return (
    <li data-testid="person-row" data-person-id={person.id} className="person-row">
      <div className="person-line">
        <button
          type="button"
          data-testid="person-colour"
          className="person-colour"
          style={{ backgroundColor: person.colour }}
          aria-label={`Change ${person.name}'s colour (${colourName(colours, person.colour)})`}
          aria-expanded={pickerOpen}
          title="Change colour"
          onClick={() => setPickerOpen((open) => !open)}
        />
        {renaming ? (
          <input
            ref={inputRef}
            data-testid="person-rename-input"
            className="roster-input person-rename-input"
            value={draft}
            aria-label={`Rename ${person.name}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onRenameKey}
            onBlur={() => void commitRename()}
          />
        ) : (
          <span className="person-name" title={person.name}>
            {person.name}
          </span>
        )}
        {!renaming && (
          <>
            <span className="person-count" title={`${taskCount} assigned`}>
              {taskCount}
            </span>
            <div className="person-actions">
              <button
                type="button"
                data-testid="person-rename"
                className="person-action"
                aria-label={`Rename ${person.name}`}
                title="Rename"
                onClick={startRename}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M10.5 2.5l3 3-8 8H2.5v-3z" />
                </svg>
              </button>
              <button
                type="button"
                data-testid="person-delete"
                className="person-action danger"
                aria-label={`Remove ${person.name}`}
                title="Remove"
                onClick={() => void remove()}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
      {pickerOpen && (
        <div className="person-picker">
          <ColourPicker
            colours={colours}
            value={person.colour}
            label={`Colour for ${person.name}`}
            onChange={(fill) => void recolour(fill)}
          />
        </div>
      )}
    </li>
  );
}

function assignedCounts(project: ProjectDetail): Map<number, number> {
  const counts = new Map<number, number>();
  for (const task of project.tasks) {
    if (task.assignee_id !== null) {
      counts.set(task.assignee_id, (counts.get(task.assignee_id) ?? 0) + 1);
    }
  }
  return counts;
}

export function RosterPanel(): JSX.Element | null {
  const { rosterOpen, current, palette } = useAppState();
  const actions = useActions();

  if (!rosterOpen || current === null) {
    return null;
  }

  const colours = palette?.colours ?? [];
  const counts = assignedCounts(current);

  return (
    <aside data-testid="roster-panel" className="roster-panel" aria-label="People">
      <header className="roster-header">
        <div className="roster-heading">
          <h2 className="roster-title">People</h2>
          <span className="roster-count">{current.people.length}</span>
        </div>
        <button
          type="button"
          data-testid="roster-close"
          className="roster-close"
          aria-label="Close people"
          title="Close"
          onClick={() => actions.setRosterOpen(false)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      </header>

      <div className="roster-body">
        {current.people.length === 0 ? (
          <div className="roster-empty-state">
            <p data-testid="roster-empty" className="roster-empty">
              No people yet
            </p>
            <p className="roster-hint">Add people to assign tasks and colour their bars.</p>
          </div>
        ) : (
          <ul className="person-list">
            {current.people.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                taskCount={counts.get(person.id) ?? 0}
                colours={colours}
              />
            ))}
          </ul>
        )}
      </div>

      <AddPersonForm people={current.people} colours={colours} />
    </aside>
  );
}
