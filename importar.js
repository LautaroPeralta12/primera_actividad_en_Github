// Importar productos desde un CSV.
// Usa funciones y variables de app.js (cliente, productos, mostrarMensaje, etc.),
// por eso en productos.html este archivo se carga DESPUÉS de app.js.

const inputCsv = document.getElementById('archivo-csv');
const vistaPreviaCsv = document.getElementById('vista-previa-csv');
const btnImportar = document.getElementById('btn-importar');
const btnCancelarImportar = document.getElementById('btn-cancelar-importar');

let filasParaImportar = [];

// Nombres de columna que aceptamos (sin tildes, mayúsculas ni símbolos)
const ALIAS_COLUMNAS = {
  codigo_barras: ['codigobarras', 'codbarras', 'codigodebarras', 'codigo', 'cod'],
  nombre: ['nombre', 'producto'],
  rubro: ['rubro'],
  subrubro: ['subrubro'],
  precio: ['precio'],
  stock: ['cantidad', 'stock']
};
const COLUMNAS_OBLIGATORIAS = ['nombre', 'precio', 'stock'];
const NOMBRE_VISIBLE = { nombre: 'nombre', precio: 'precio', stock: 'cantidad' };

function claveColumna(texto) {
  return normalizar(texto).replace(/[^a-z0-9]/g, '');
}

// ---------- Leer el archivo (UTF-8, o Windows-1252 si es de Excel viejo) ----------
async function leerArchivoComoTexto(archivo) {
  const bytes = await archivo.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// ---------- Parser de CSV (acepta ; , o tabulador, y comillas) ----------
function detectarSeparador(texto) {
  const primera = texto.split(/\r?\n/)[0] || '';
  const conteo = { ';': 0, ',': 0, '\t': 0 };
  let entreComillas = false;

  for (const c of primera) {
    if (c === '"') entreComillas = !entreComillas;
    else if (!entreComillas && c in conteo) conteo[c]++;
  }
  return Object.entries(conteo).sort((a, b) => b[1] - a[1])[0][0];
}

function parsearCsv(texto, separador) {
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

// ---------- Validar las filas ----------
function analizarCsv(texto) {
  texto = texto.replace(/^\uFEFF/, ''); // saca el BOM si lo tiene
  const filas = parsearCsv(texto, detectarSeparador(texto));

  if (filas.length === 0 || filas[0].every(c => c.trim() === '')) {
    return { errorGeneral: 'El archivo está vacío.' };
  }

  // Qué columna del archivo corresponde a cada campo
  const claves = filas[0].map(claveColumna);
  const indice = {};
  for (const [campo, alias] of Object.entries(ALIAS_COLUMNAS)) {
    const pos = claves.findIndex(k => alias.includes(k));
    if (pos !== -1) indice[campo] = pos;
  }

  const faltan = COLUMNAS_OBLIGATORIAS.filter(c => !(c in indice));
  if (faltan.length > 0) {
    return {
      errorGeneral: 'Faltan columnas obligatorias en la primera fila: '
        + faltan.map(c => NOMBRE_VISIBLE[c]).join(', ') + '.'
    };
  }

  const dato = (fila, campo) => (campo in indice ? (fila[indice[campo]] || '').trim() : '');

  const codigosExistentes = new Set(
    productos.map(p => (p.codigo_barras || '').trim()).filter(Boolean)
  );
  const codigosDelArchivo = new Set();

  const validas = [];
  const errores = [];
  const repetidas = [];

  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i];
    if (fila.every(c => c.trim() === '')) continue; // fila vacía

    const numeroFila = i + 1; // la fila 1 es el encabezado
    const nombre = dato(fila, 'nombre');
    const precioTxt = dato(fila, 'precio');
    const stockTxt = dato(fila, 'stock');
    const codigo = dato(fila, 'codigo_barras');

    const problemas = [];
    if (!nombre) problemas.push('falta el nombre');
    if (!/^\d+([.,]\d+)?$/.test(precioTxt)) problemas.push(`precio inválido ("${precioTxt}")`);
    if (!/^\d+$/.test(stockTxt)) problemas.push(`cantidad inválida ("${stockTxt}")`);
    if (/^\d+([.,]\d+)?e\+?\d+$/i.test(codigo)) {
      problemas.push('el código de barras quedó en notación científica (en Excel poné esa columna en formato Texto)');
    }

    if (problemas.length > 0) {
      errores.push({ fila: numeroFila, motivo: problemas.join(', ') });
      continue;
    }

    if (codigo && (codigosExistentes.has(codigo) || codigosDelArchivo.has(codigo))) {
      repetidas.push({ fila: numeroFila, codigo, nombre });
      continue;
    }
    if (codigo) codigosDelArchivo.add(codigo);

    validas.push({
      codigo_barras: codigo || null,
      nombre,
      rubro: dato(fila, 'rubro') || null,
      subrubro: dato(fila, 'subrubro') || null,
      precio: parseFloat(precioTxt.replace(',', '.')),
      stock: parseInt(stockTxt, 10)
    });
  }

  return { validas, errores, repetidas };
}

// ---------- Vista previa ----------
function mostrarVistaPrevia(resultado) {
  vistaPreviaCsv.hidden = false;

  if (resultado.errorGeneral) {
    vistaPreviaCsv.innerHTML = `<p class="mensaje error">${escapeHtml(resultado.errorGeneral)}</p>`;
    btnImportar.hidden = true;
    btnCancelarImportar.hidden = false;
    filasParaImportar = [];
    return;
  }

  const { validas, errores, repetidas } = resultado;
  filasParaImportar = validas;

  let html = `<p class="resumen"><strong>${validas.length}</strong> productos listos para importar`;
  if (repetidas.length) html += ` · <strong>${repetidas.length}</strong> omitidos por código de barras repetido`;
  if (errores.length) html += ` · <strong>${errores.length}</strong> filas con errores`;
  html += '.</p>';

  if (validas.length > 0) {
    html += `
      <div class="tabla-scroll">
        <table>
          <thead><tr><th>Cód. barras</th><th>Nombre</th><th>Rubro</th><th>Subrubro</th><th>Precio</th><th>Cantidad</th></tr></thead>
          <tbody>
            ${validas.slice(0, 10).map(p => `
              <tr>
                <td>${escapeHtml(p.codigo_barras)}</td>
                <td>${escapeHtml(p.nombre)}</td>
                <td>${escapeHtml(p.rubro)}</td>
                <td>${escapeHtml(p.subrubro)}</td>
                <td>$${p.precio.toFixed(2)}</td>
                <td>${p.stock}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    if (validas.length > 10) html += `<p class="ayuda">Se muestran los primeros 10 de ${validas.length}.</p>`;
  }

  if (errores.length) {
    html += '<p><strong>Filas con errores (no se importan):</strong></p><ul class="lista-errores">'
      + errores.slice(0, 10).map(e => `<li>Fila ${e.fila}: ${escapeHtml(e.motivo)}</li>`).join('')
      + '</ul>';
    if (errores.length > 10) html += `<p class="ayuda">…y ${errores.length - 10} más.</p>`;
  }

  if (repetidas.length) {
    html += '<p><strong>Omitidos porque ya existe ese código de barras:</strong></p><ul class="lista-errores">'
      + repetidas.slice(0, 10).map(r => `<li>Fila ${r.fila}: ${escapeHtml(r.nombre)} (${escapeHtml(r.codigo)})</li>`).join('')
      + '</ul>';
    if (repetidas.length > 10) html += `<p class="ayuda">…y ${repetidas.length - 10} más.</p>`;
  }

  vistaPreviaCsv.innerHTML = html;
  btnImportar.textContent = `Importar ${validas.length} productos`;
  btnImportar.hidden = validas.length === 0;
  btnCancelarImportar.hidden = false;
}

function cancelarImportacion() {
  inputCsv.value = '';
  filasParaImportar = [];
  vistaPreviaCsv.hidden = true;
  vistaPreviaCsv.innerHTML = '';
  btnImportar.hidden = true;
  btnCancelarImportar.hidden = true;
}

// ---------- Importar (INSERT por tandas) ----------
async function importarProductos() {
  if (!cliente || filasParaImportar.length === 0) return;

  btnImportar.disabled = true;
  btnImportar.textContent = 'Importando...';
  ocultarMensaje();

  const TANDA = 500;
  let insertados = 0;

  for (let i = 0; i < filasParaImportar.length; i += TANDA) {
    const tanda = filasParaImportar.slice(i, i + TANDA);
    const { error } = await cliente.from('productos').insert(tanda);

    if (error) {
      console.error('Error al importar:', error);
      const parcial = insertados > 0 ? ` (se alcanzaron a importar ${insertados} antes del error)` : '';
      mostrarMensaje('No se pudo importar: ' + explicarError(error) + parcial, 'error');
      btnImportar.disabled = false;
      btnImportar.textContent = `Importar ${filasParaImportar.length} productos`;
      if (insertados > 0) cargarProductos();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    insertados += tanda.length;
  }

  btnImportar.disabled = false;
  cancelarImportacion();
  mostrarMensaje(`Se importaron ${insertados} productos.`, 'ok');
  cargarProductos();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Eventos ----------
inputCsv.addEventListener('change', async () => {
  const archivo = inputCsv.files[0];
  if (!archivo) return;

  try {
    mostrarVistaPrevia(analizarCsv(await leerArchivoComoTexto(archivo)));
  } catch (error) {
    console.error('No se pudo leer el archivo:', error);
    mostrarVistaPrevia({ errorGeneral: 'No se pudo leer el archivo.' });
  }
});

btnImportar.addEventListener('click', importarProductos);
btnCancelarImportar.addEventListener('click', cancelarImportacion);
