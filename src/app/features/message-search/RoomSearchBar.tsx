import React, {
  useEffect,
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, Chip, Icon, Icons, Input, MenuItem, Text, config } from 'folds';
import { useAtom, useAtomValue } from 'jotai';
import { roomSearchLookupAtom, roomSearchTermAtom } from '../../state/roomSearch';
import { applySuggestion, getSearchSuggestions } from './searchSuggest';
import * as css from './RoomSearchBar.css';

/**
 * Message search box with search operators. Typing `from:`, `in:`,
 * `has:` and friends opens a completion list; Enter or Tab accepts the
 * highlighted entry, and Enter with nothing highlighted runs the search.
 */
export function RoomSearchBar() {
  const [searchTerm, setSearchTerm] = useAtom(roomSearchTermAtom);
  const lookup = useAtomValue(roomSearchLookupAtom);
  const inputRef = useRef<HTMLInputElement>(null);

  const [value, setValue] = useState(searchTerm ?? '');
  const [caret, setCaret] = useState(0);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>();

  const suggestions = useMemo(
    () => (open ? getSearchSuggestions(value, caret, lookup) : undefined),
    [open, value, caret, lookup]
  );
  const items = suggestions?.items ?? [];

  // a filter chip in the results edits the query from outside the box
  useEffect(() => {
    setValue(searchTerm ?? '');
  }, [searchTerm]);

  const syncCaret = () => setCaret(inputRef.current?.selectionStart ?? value.length);

  const handleChange: ChangeEventHandler<HTMLInputElement> = (evt) => {
    setValue(evt.target.value);
    setCaret(evt.target.selectionStart ?? evt.target.value.length);
    setHighlight(undefined);
    setOpen(true);
  };

  const accept = (index: number) => {
    if (!suggestions) return;
    const applied = applySuggestion(value, suggestions, suggestions.items[index]);
    setValue(applied.value);
    setCaret(applied.caret);
    setHighlight(undefined);
    // park the caret after React has put the new value in the input
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(applied.caret, applied.caret);
    });
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = (evt) => {
    if (evt.key === 'Escape' && open) {
      evt.preventDefault();
      setOpen(false);
      return;
    }
    if (items.length === 0) return;
    if ((evt.key === 'ArrowDown' || evt.key === 'ArrowUp') && !evt.altKey) {
      evt.preventDefault();
      const step = evt.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) => {
        if (h === undefined) return step === 1 ? 0 : items.length - 1;
        return (h + step + items.length) % items.length;
      });
    } else if (evt.key === 'Tab' || (evt.key === 'Enter' && highlight !== undefined)) {
      evt.preventDefault();
      accept(highlight ?? 0);
    }
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const query = value.trim();
    setOpen(false);
    if (query) setSearchTerm(query);
  };

  const handleClear = () => {
    setValue('');
    setCaret(0);
    setOpen(false);
    setSearchTerm(undefined);
    inputRef.current?.focus();
  };

  // keep the input focused while a suggestion is being clicked
  const keepFocus: MouseEventHandler = (evt) => evt.preventDefault();

  return (
    <Box
      as="form"
      className={css.SearchForm}
      onSubmit={handleSubmit}
      grow="No"
      shrink="No"
      alignItems="Center"
      gap="200"
    >
      <Input
        ref={inputRef}
        name="searchInput"
        value={value}
        style={{ flexGrow: 1, paddingRight: config.space.S200 }}
        placeholder="Search messages"
        variant="Background"
        size="300"
        radii="400"
        outlined
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={items.length > 0}
        aria-autocomplete="list"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={syncCaret}
        onClick={syncCaret}
        onFocus={() => {
          syncCaret();
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        before={<Icon size="50" src={Icons.Search} />}
        after={
          searchTerm || value ? (
            <Chip
              variant="Surface"
              size="400"
              radii="Pill"
              outlined
              aria-pressed
              type="button"
              onMouseDown={keepFocus}
              onClick={handleClear}
              after={<Icon size="50" src={Icons.Cross} />}
            >
              <Text size="B300">Clear</Text>
            </Chip>
          ) : null
        }
      />
      {suggestions && items.length > 0 && (
        <div className={css.Suggestions} role="presentation" onMouseDown={keepFocus}>
          <Text className={css.SuggestionTitle} size="L400" priority="300">
            {suggestions.title}
          </Text>
          {items.map((item, index) => (
            <MenuItem
              key={item.key}
              aria-pressed={highlight === index}
              variant="Surface"
              size="300"
              radii="300"
              onClick={() => accept(index)}
              onMouseEnter={() => setHighlight(index)}
            >
              <Box grow="Yes" gap="200" alignItems="Baseline" justifyContent="SpaceBetween">
                <Text size="T300" truncate>
                  {item.label}
                </Text>
                {item.hint && (
                  <Text size="T200" priority="300" truncate>
                    {item.hint}
                  </Text>
                )}
              </Box>
            </MenuItem>
          ))}
        </div>
      )}
    </Box>
  );
}
