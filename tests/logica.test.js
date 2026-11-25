const test = require('node:test');
const assert = require('node:assert/strict');
const {
  convertValue,
  readNotes,
  upsertNote,
  removeNote,
  filterNotes,
  createStorage,
  THEME_LABELS,
} = require('../script.js');

test('convierte unidades de longitud y masa', () => {
  assert.equal(convertValue('longitud', 2, 'km', 'm'), 2000);
  assert.equal(convertValue('longitud', 100, 'cm', 'm'), 1);
  assert.equal(convertValue('masa', 1500, 'g', 'kg'), 1.5);
});

test('convierte temperaturas entre Celsius, Fahrenheit y Kelvin', () => {
  assert.equal(convertValue('temperatura', 0, 'C', 'F'), 32);
  assert.equal(convertValue('temperatura', 32, 'F', 'C'), 0);
  assert.equal(convertValue('temperatura', 0, 'C', 'K'), 273.15);
  assert.equal(convertValue('temperatura', 273.15, 'K', 'C'), 0);
});

test('rechaza entradas y resultados inválidos y temperaturas bajo cero absoluto', () => {
  for (const input of ['', null, Infinity, NaN]) {
    assert.throws(() => convertValue('longitud', input, 'm', 'km'));
  }
  assert.throws(() => convertValue('longitud', 1, 'm', 'kg'));
  assert.throws(() => convertValue('longitud', Number.MAX_VALUE, 'km', 'cm'));
  assert.throws(() => convertValue('temperatura', Number.MAX_VALUE, 'C', 'F'));
  assert.throws(() => convertValue('temperatura', -274, 'C', 'K'));
  assert.equal(convertValue('temperatura', 0, 'K', 'C'), -273.15);
});

test('recupera datos guardados y trata JSON corrupto como una lista vacía', () => {
  assert.deepEqual(readNotes('[{"id":"a","text":"Nota","theme":"repaso"}]'), [
    { id: 'a', text: 'Nota', theme: 'repaso' },
  ]);
  assert.deepEqual(readNotes('{ roto'), []);
  assert.deepEqual(readNotes('{"notas":true}'), []);
});

test('lee y escribe notas mediante la API localStorage y reporta errores de acceso', () => {
  const values = new Map();
  const host = {
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, value); },
    },
  };
  const storage = createStorage(host);
  const note = { id: 'persistida', text: 'Una nota real', theme: 'repaso' };

  assert.deepEqual(storage.read(), { notes: [], available: true, warning: '' });
  assert.deepEqual(storage.write([note]), { ok: true, warning: '' });
  assert.deepEqual(storage.read().notes, [note]);

  const brokenHost = {
    get localStorage() { throw new Error('Acceso denegado'); },
  };
  const unavailable = createStorage(brokenHost);
  assert.equal(unavailable.read().available, false);
  assert.match(unavailable.read().warning, /No se pudo acceder/);
  assert.equal(unavailable.write([note]).ok, false);

  const fullHost = { localStorage: { getItem: () => null, setItem() { throw new Error('Cuota'); } } };
  const failedWrite = createStorage(fullHost).write([note]);
  assert.equal(failedWrite.ok, false);
  assert.match(failedWrite.warning, /No se pudieron guardar/);
});

test('crea, actualiza, borra y filtra notas sin mutar la lista original', () => {
  const original = [{ id: 'a', text: 'Uno', theme: 'pendientes' }];
  const updated = upsertNote(original, { id: 'a', text: 'Editada', theme: 'repaso' });
  const added = upsertNote(updated, { id: 'b', text: 'Dos', theme: 'calculos' });
  assert.equal(original[0].text, 'Uno');
  assert.deepEqual(filterNotes(added, 'repaso').map((note) => note.id), ['a']);
  assert.deepEqual(filterNotes(added, 'todos'), added);
  assert.deepEqual(removeNote(added, 'a').map((note) => note.id), ['b']);
});


test('mantiene etiquetas distintas para pendientes y repaso sin cambiar sus valores', () => {
  assert.equal(THEME_LABELS.pendientes, 'Pendientes');
  assert.equal(THEME_LABELS.repaso, 'Ideas');
  assert.equal(THEME_LABELS.calculos, 'Cálculos');
});
