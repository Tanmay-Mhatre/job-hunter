Fields collect input. Every field has a visible label; placeholders only show format.

## Use
- `rj-field` containing `rj-field__label` (a real `<label for>`), an `rj-input`, then `rj-field__help` or `rj-field__error`.
- Search: `rj-search` with a 16px search icon, a visually hidden label and an `rj-kbd` showing `/`.
- Errors set `aria-invalid="true"` and `aria-describedby` on the input.

## Rules
- Inputs use `input-bg`, `input-border` (3:1 on every surface) and `input-border-hover`; focus is the 2px `focus-ring`.
- Help and error text are 14px (`small`): they are content, not footnotes.
- Input text is 16px so phones do not zoom.
- Validate on blur, clear the error as soon as the value is fixed.
- Error copy says what happened and how to fix it, never blames the person: "This board returned no jobs. Check the link or try the company's main careers page."
- No decorative icons inside inputs. Only search, clear and show-password icons are allowed.
