(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') api.start(document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const STORAGE_KEY = 'club-punto-y-aparte:muro-de-repaso:notas:v1';
  const THEMES = ['pendientes', 'repaso', 'calculos'];
  const THEME_LABELS = { pendientes: 'Pendientes', repaso: 'Ideas', calculos: 'Cálculos' };
  const UNIT_GROUPS = {
    longitud: { m: 1, km: 1000, cm: 0.01 },
    masa: { g: 1, kg: 1000 },
  };

  function convertValue(type, value, from, to) {
    if (value === null || typeof value === 'boolean') {
      throw new Error('Ingresá un valor numérico.');
    }
    if (typeof value === 'string' && value.trim() === '') {
      throw new Error('Ingresá un valor numérico.');
    }
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('Ingresá un número finito.');

    let result;
    if (type === 'temperatura') {
      const toKelvin = {
        C: (n) => n + 273.15,
        F: (n) => (n - 32) * 5 / 9 + 273.15,
        K: (n) => n,
      };
      const fromKelvin = {
        C: (n) => n - 273.15,
        F: (n) => (n - 273.15) * 9 / 5 + 32,
        K: (n) => n,
      };
      if (!toKelvin[from] || !fromKelvin[to]) throw new Error('Elegí unidades de temperatura válidas.');
      const kelvin = toKelvin[from](number);
      if (kelvin < 0) throw new Error('La temperatura no puede ser inferior al cero absoluto (0 K).');
      result = fromKelvin[to](kelvin);
    } else {
      const units = UNIT_GROUPS[type];
      if (!units || !(from in units) || !(to in units)) {
        throw new Error('Las unidades elegidas no corresponden al tipo de conversión.');
      }
      result = number * units[from] / units[to];
    }
    if (!Number.isFinite(result)) throw new Error('El resultado está fuera del rango numérico.');
    if (type === 'temperatura' && to === 'K' && result < 0) {
      throw new Error('La temperatura no puede ser inferior al cero absoluto (0 K).');
    }
    return result;
  }

  function readNotes(raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((note) => note &&
        typeof note.id === 'string' &&
        typeof note.text === 'string' && note.text.trim() !== '' &&
        THEMES.includes(note.theme)
      ).map(({ id, text, theme }) => ({ id, text, theme }));
    } catch (_) {
      return [];
    }
  }

  function upsertNote(notes, note) {
    const next = notes.filter((item) => item.id !== note.id);
    return [note, ...next];
  }

  function removeNote(notes, id) {
    return notes.filter((note) => note.id !== id);
  }

  function filterNotes(notes, theme) {
    return theme === 'todos' ? notes.slice() : notes.filter((note) => note.theme === theme);
  }

  function createStorage(host) {
    let available = true;
    let warning = '';

    function read() {
      try {
        const raw = host.localStorage.getItem(STORAGE_KEY);
        const notes = raw === null ? [] : readNotes(raw);
        if (raw !== null) {
          try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) warning = 'Los datos guardados no tenían un formato válido. Se inicia un muro vacío.';
            else if (parsed.length !== notes.length) warning = 'Algunas notas guardadas estaban dañadas y se omitieron.';
          } catch (_) {
            warning = 'Los datos guardados estaban dañados. Se inicia un muro vacío.';
          }
        }
        return { notes, available, warning };
      } catch (_) {
        available = false;
        warning = 'No se pudo acceder al almacenamiento de este navegador. Los cambios durarán solo mientras esta página permanezca abierta.';
        return { notes: [], available, warning };
      }
    }

    function write(notes) {
      if (!available) return { ok: false, warning };
      try {
        host.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
        return { ok: true, warning: '' };
      } catch (_) {
        available = false;
        warning = 'No se pudieron guardar los cambios. El muro seguirá disponible durante esta sesión.';
        return { ok: false, warning };
      }
    }

    return { read, write };
  }

  function start(doc) {
    const $ = (id) => doc.getElementById(id);
    const form = doc.querySelector('.form-conversion');
    const type = $('tipo');
    const quantity = $('cantidad');
    const from = $('desde');
    const to = $('hasta');
    const conversionOutput = $('salida-conversion');
    const saveResult = doc.querySelector('.guardar-conversion');
    const noteForm = $('form-nota');
    const noteText = $('nota-texto');
    const noteTheme = $('nota-tema');
    const filter = $('filtro-tema');
    const notice = $('aviso-notas');
    const wall = doc.querySelector('.muro-notas');
    const cancelEdit = doc.querySelector('.cancelar-edicion');

    if (!form || !noteForm || !wall) return;

    let notes = [];
    let editingId = null;
    let currentConversion = null;
    const storage = createStorage(root);
    const stored = storage.read();
    notes = stored.notes;
    let storageWarning = stored.warning;

    function showNotice(message, kind) {
      notice.textContent = message;
      notice.dataset.kind = kind || 'info';
    }

    function persist() {
      const result = storage.write(notes);
      if (!result.ok) storageWarning = result.warning;
      return result.ok;
    }

    function render() {
      wall.replaceChildren();
      const visibleNotes = filterNotes(notes, filter.value);
      if (visibleNotes.length === 0) {
        const empty = doc.createElement('p');
        empty.className = 'muro-vacio';
        empty.textContent = notes.length ? 'No hay notas en este tema.' : 'Todavía no hay notas. Escribí la primera desde el editor.';
        wall.append(empty);
      }
      for (const note of visibleNotes) {
        const card = doc.createElement('article');
        card.className = 'nota-tarjeta';
        card.dataset.theme = note.theme;
        const heading = doc.createElement('h3');
        heading.textContent = themeLabel(note.theme);
        const body = doc.createElement('p');
        body.textContent = note.text;
        const actions = doc.createElement('div');
        actions.className = 'acciones-nota';
        const edit = doc.createElement('button');
        edit.type = 'button';
        edit.className = 'boton boton-secundario';
        edit.textContent = 'Editar';
        edit.setAttribute('aria-label', `Editar nota: ${note.text.slice(0, 60)}`);
        edit.addEventListener('click', () => beginEdit(note));
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'boton boton-borrar';
        remove.textContent = 'Borrar';
        remove.setAttribute('aria-label', `Borrar nota: ${note.text.slice(0, 60)}`);
        remove.addEventListener('click', () => deleteNote(note.id));
        actions.append(edit, remove);
        card.append(heading, body, actions);
        wall.append(card);
      }
    }

    function themeLabel(theme) {
      return THEME_LABELS[theme] || 'Pendientes';
    }

    function clearEditor() {
      editingId = null;
      noteForm.reset();
      noteForm.querySelector('[type="submit"]').textContent = 'Guardar nota';
      cancelEdit.hidden = true;
    }

    function beginEdit(note) {
      editingId = note.id;
      noteText.value = note.text;
      noteTheme.value = note.theme;
      noteForm.querySelector('[type="submit"]').textContent = 'Guardar cambios';
      cancelEdit.hidden = false;
      noteText.focus();
      showNotice('Editando una nota. Guardá los cambios o cancelá la edición.', 'info');
    }

    function deleteNote(id) {
      notes = removeNote(notes, id);
      const saved = persist();
      if (editingId === id) {
        clearEditor();
        showNotice(saved ? 'La nota que estabas editando se borró; la edición se canceló.' : storageWarning, saved ? 'info' : 'error');
      } else {
        showNotice(saved ? 'Nota borrada.' : storageWarning, saved ? 'success' : 'error');
      }
      render();
      noteText.focus();
    }

    function updateUnitOptions() {
      const units = type.value === 'longitud' ? ['m', 'km', 'cm']
        : type.value === 'masa' ? ['g', 'kg'] : ['C', 'F', 'K'];
      const previousFrom = from.value;
      const previousTo = to.value;
      from.replaceChildren();
      to.replaceChildren();
      for (const unit of units) {
        const fromOption = doc.createElement('option');
        fromOption.value = unit;
        fromOption.textContent = unit;
        const toOption = fromOption.cloneNode(true);
        from.append(fromOption);
        to.append(toOption);
      }
      from.value = units.includes(previousFrom) ? previousFrom : units[0];
      to.value = units.includes(previousTo) ? previousTo : units[1] || units[0];
      invalidateConversion();
    }

    function invalidateConversion() {
      currentConversion = null;
      conversionOutput.textContent = 'Completá los datos y convertí para ver el resultado.';
      saveResult.disabled = true;
    }

    function conversionSignature() {
      return [type.value, quantity.value, from.value, to.value].join('|');
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try {
        const value = convertValue(type.value, quantity.value, from.value, to.value);
        const formatted = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 8 }).format(value);
        currentConversion = { signature: conversionSignature(), value, formatted };
        delete conversionOutput.dataset.kind;
        conversionOutput.textContent = `${formatted} ${to.value}`;
        saveResult.disabled = false;
      } catch (error) {
        invalidateConversion();
        conversionOutput.textContent = error.message;
        conversionOutput.dataset.kind = 'error';
      }
    });

    for (const control of [quantity, from, to]) {
      control.addEventListener('input', invalidateConversion);
      control.addEventListener('change', invalidateConversion);
    }
    type.addEventListener('change', updateUnitOptions);

    saveResult.addEventListener('click', () => {
      if (!currentConversion || currentConversion.signature !== conversionSignature()) {
        invalidateConversion();
        showNotice('El resultado cambió. Volvé a convertir antes de guardarlo.', 'error');
        return;
      }
      const text = `${quantity.value} ${from.value} = ${currentConversion.formatted} ${to.value} (${type.options[type.selectedIndex].textContent})`;
      notes = upsertNote(notes, { id: createId(), text, theme: 'calculos' });
      const saved = persist();
      render();
      showNotice(saved ? 'Resultado guardado en el muro.' : storageWarning, saved ? 'success' : 'error');
    });

    noteForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = noteText.value.trim();
      if (!text) {
        showNotice('Escribí el texto de la nota antes de guardarla.', 'error');
        noteText.focus();
        return;
      }
      const wasEditing = Boolean(editingId);
      const note = { id: editingId || createId(), text, theme: noteTheme.value };
      notes = upsertNote(notes, note);
      const saved = persist();
      clearEditor();
      render();
      showNotice(saved ? (wasEditing ? 'Nota actualizada.' : 'Nota guardada.') : storageWarning, saved ? 'success' : 'error');
      noteText.focus();
    });

    cancelEdit.addEventListener('click', () => {
      clearEditor();
      showNotice('Edición cancelada.', 'info');
      noteText.focus();
    });
    filter.addEventListener('change', render);

    function createId() {
      return `nota-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    updateUnitOptions();
    render();
    if (storageWarning) showNotice(storageWarning, 'warning');
    else showNotice('Las notas se guardan en este navegador.', 'info');
  }

  return { convertValue, readNotes, upsertNote, removeNote, filterNotes, createStorage, THEME_LABELS, start };
});
