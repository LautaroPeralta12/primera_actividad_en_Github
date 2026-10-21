// ---------- Referencias al HTML ----------
const form = document.getElementById('product-form');
const contenedor = document.getElementById('product-list');
const mensaje = document.getElementById('mensaje');
const btnCancelar = document.getElementById('btn-cancelar');
const listaCategorias = document.getElementById('lista-categorias');
const buscador = document.getElementById('buscador');

let productos = []; // copia local para poder editar sin pasar datos por el HTML

// ---------- Utilidades ----------
function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto;
  mensaje.className = 'mensaje ' + tipo; // "ok" o "error"
  mensaje.hidden = false;
}

function ocultarMensaje() {
  mensaje.hidden = true;
}

function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Pasa a minúsculas y saca las tildes, para que "cafe" encuentre "Café"
function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Agrupa los productos por categoría (sin distinguir mayúsculas/minúsculas)
// y deja "Sin categoría" siempre al final.
function agruparPorCategoria(lista) {
  const grupos = new Map();

  for (const p of lista) {
    const nombre = (p.categoria || '').trim();
    const clave = nombre.toLowerCase();

    if (!grupos.has(clave)) {
      grupos.set(clave, { nombre: nombre || 'Sin categoría', items: [] });
    }
    grupos.get(clave).items.push(p);
  }

  return [...grupos.entries()]
    .sort(([a], [b]) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b, 'es');
    })
    .map(([, grupo]) => {
      grupo.items.sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
      return grupo;
    });
}

// Sugerencias de categorías ya usadas para el campo del formulario
function actualizarSugerencias(grupos) {
  listaCategorias.innerHTML = grupos
    .filter(g => g.nombre !== 'Sin categoría')
    .map(g => `<option value="${escapeHtml(g.nombre)}"></option>`)
    .join('');
}

// ---------- Leer productos (SELECT) ----------
async function cargarProductos() {
  const { data, error } = await db
    .from('productos')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    console.error('Error al cargar productos:', error);
    contenedor.innerHTML = '<p class="vacio">No se pudieron cargar los productos.</p>';
    mostrarMensaje('Error al leer la tabla "productos": ' + error.message, 'error');
    return;
  }

  productos = data;
  dibujarProductos();
}

// ---------- Dibujar las columnas (aplica el buscador) ----------
function dibujarProductos() {
  // Las sugerencias del formulario usan TODAS las categorías, no solo las filtradas
  actualizarSugerencias(agruparPorCategoria(productos));

  if (productos.length === 0) {
    contenedor.innerHTML = '<p class="vacio">Todavía no hay productos.</p>';
    return;
  }

  const termino = normalizar(buscador.value.trim());
  const filtrados = termino
    ? productos.filter(p => normalizar(p.nombre).includes(termino))
    : productos;

  if (filtrados.length === 0) {
    contenedor.innerHTML = `<p class="vacio">No se encontraron productos para "${escapeHtml(buscador.value.trim())}".</p>`;
    return;
  }

  const grupos = agruparPorCategoria(filtrados);

  contenedor.innerHTML = grupos.map(grupo => `
    <section class="columna">
      <h3>${escapeHtml(grupo.nombre)} <span class="contador">${grupo.items.length}</span></h3>
      <ul class="productos">
        ${grupo.items.map(p => `
          <li class="producto">
            <div class="producto-info">
              <strong>${escapeHtml(p.nombre)}</strong>
              <span class="precio">$${Number(p.precio).toFixed(2)}</span>
              ${p.stock > 0
                ? `<span class="stock">Stock: ${p.stock}</span>`
                : '<span class="sin-stock">Sin stock</span>'}
            </div>
            <div class="acciones">
              <button type="button" data-accion="editar" data-id="${p.id}">Editar</button>
              <button type="button" data-accion="eliminar" data-id="${p.id}" class="peligro">Eliminar</button>
            </div>
          </li>
        `).join('')}
      </ul>
    </section>
  `).join('');
}

// ---------- Agregar / actualizar (INSERT / UPDATE) ----------
async function guardarProducto(e) {
  e.preventDefault();
  ocultarMensaje();

  const id = document.getElementById('product-id').value;
  const producto = {
    nombre: document.getElementById('nombre').value.trim(),
    categoria: document.getElementById('categoria').value.trim(),
    precio: parseFloat(document.getElementById('precio').value),
    stock: parseInt(document.getElementById('stock').value, 10)
  };

  let error;
  if (id) {
    ({ error } = await db.from('productos').update(producto).eq('id', id));
  } else {
    ({ error } = await db.from('productos').insert([producto]));
  }

  if (error) {
    console.error('Error al guardar:', error);
    mostrarMensaje('No se pudo guardar: ' + error.message, 'error');
    return;
  }

  mostrarMensaje(id ? 'Producto actualizado.' : 'Producto agregado.', 'ok');
  limpiarFormulario();
  cargarProductos();
}

// ---------- Editar: pasa los datos al formulario ----------
function editarProducto(id) {
  const p = productos.find(item => item.id === id);
  if (!p) return;

  document.getElementById('product-id').value = p.id;
  document.getElementById('nombre').value = p.nombre;
  document.getElementById('categoria').value = p.categoria || '';
  document.getElementById('precio').value = p.precio;
  document.getElementById('stock').value = p.stock;

  document.getElementById('form-title').textContent = 'Editar producto';
  document.getElementById('btn-submit').textContent = 'Guardar cambios';
  btnCancelar.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Eliminar (DELETE) ----------
async function eliminarProducto(id) {
  if (!confirm('¿Seguro que querés eliminar este producto?')) return;

  const { error } = await db.from('productos').delete().eq('id', id);

  if (error) {
    console.error('Error al eliminar:', error);
    mostrarMensaje('No se pudo eliminar: ' + error.message, 'error');
    return;
  }

  mostrarMensaje('Producto eliminado.', 'ok');
  cargarProductos();
}

// ---------- Limpiar formulario ----------
function limpiarFormulario() {
  form.reset();
  document.getElementById('product-id').value = '';
  document.getElementById('form-title').textContent = 'Agregar producto';
  document.getElementById('btn-submit').textContent = 'Guardar producto';
  btnCancelar.hidden = true;
}

// ---------- Eventos ----------
form.addEventListener('submit', guardarProducto);
btnCancelar.addEventListener('click', limpiarFormulario);
buscador.addEventListener('input', dibujarProductos);

// Un solo listener para todos los botones de las columnas
contenedor.addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-accion]');
  if (!boton) return;

  const id = Number(boton.dataset.id);
  if (boton.dataset.accion === 'editar') editarProducto(id);
  if (boton.dataset.accion === 'eliminar') eliminarProducto(id);
});

// ---------- Inicio ----------
if (!db) {
  mostrarMensaje('No se pudo iniciar Supabase. Revisá que index.html cargue la librería y conexion.js.', 'error');
} else {
  cargarProductos();
}
