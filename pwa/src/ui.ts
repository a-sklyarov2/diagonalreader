/** Shared transient UI: snackbar + modal dialog. No framework. */

let snackbarTimer = 0;

export function snackbar(message: string): void {
  let el = document.querySelector<HTMLDivElement>('.snackbar');
  if (!el) {
    el = document.createElement('div');
    el.className = 'snackbar';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(snackbarTimer);
  snackbarTimer = window.setTimeout(() => el.classList.remove('show'), 4000);
}

export interface DialogAction {
  label: string;
  onClick?: () => void;
}

export function showDialog(
  title: string,
  lines: string[],
  actions: DialogAction[],
): void {
  closeDialog();
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  const box = document.createElement('div');
  box.className = 'dialog';
  box.setAttribute('role', 'dialog');
  const heading = document.createElement('h2');
  heading.textContent = title;
  box.appendChild(heading);
  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'dialog-line';
    p.textContent = line;
    box.appendChild(p);
  }
  const row = document.createElement('div');
  row.className = 'dialog-actions';
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dialog-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      closeDialog();
      action.onClick?.();
    });
    row.appendChild(btn);
  }
  box.appendChild(row);
  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDialog();
  });
  document.body.appendChild(overlay);
}

export function closeDialog(): void {
  document.querySelector('.dialog-overlay')?.remove();
}
