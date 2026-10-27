// Si algo falla, lo mostramos en la página en vez de quedarnos en "Cargando..."
window.addEventListener('error', (e) => {
  const caja = document.getElementById('mensaje');
  if (caja) {
    caja.textContent = 'Error en la página: ' + e.message + ' (revisá que todos los archivos sean las versiones nuevas)';
    caja.className = 'mensaje error';
    caja.hidden = false;
  }
});

// Cliente de Supabase: funciona con el conexion.js nuevo (db) y con el viejo (supabaseClient)
const cliente = (typeof db !== 'undefined' && db) || (typeof supabaseClient !== 'undefined' && supabaseClient) || null;

// ---------- Referencias al HTML ----------
const form = document.getElementById('product-form');
const contenedor = document.getElementById('product-list');
const mensaje = document.getElementById('mensaje');
const btnCancelar = document.getElementById('btn-cancelar');
const listaRubros = document.getElementById('lista-rubros');
const buscador = document.getElementById('buscador');
const filtroRubro = document.getElementById('filtro-rubro');
const btnVistaColumnas = document.getElementById('btn-vista-columnas');
const btnVistaTabla = document.getElementById('btn-vista-tabla');

const SIN_RUBRO = 'Sin rubro';

let productos = [];     // copia local para poder editar sin pasar datos por el HTML
let vista = 'columnas'; // 'columnas' o 'tabla'

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

// Clave para comparar rubros: "lácteos" y "Lácteos" son el mismo
function claveRubro(texto) {
  return String(texto ?? '').trim().toLowerCase();
}

function valorBuscador() {
  return buscador ? buscador.value.trim() : '';
}

// Traduce los errores de Supabase a mensajes entendibles
function explicarError(error) {
  if (error.code === '23505') {
    return 'Ya existe un producto con ese código de barras.';
  }
  if (error.code === 'PGRST204' || /schema cache|does not exist/i.test(error.message || '')) {
    return error.message + ' → Falta ejecutar migracion.sql en Supabase (SQL Editor).';
  }
  return error.message;
}

// Agrupa los productos por rubro y deja "Sin rubro" siempre al final
function agruparPorRubro(lista) {
  const grupos = new Map();

  for (const p of lista) {
    const nombre = (p.rubro || '').trim();
    const clave = claveRubro(nombre);

    if (!grupos.has(clave)) {
      grupos.set(clave, { nombre: nombre || SIN_RUBRO, items: [] });
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

// Rubros ya usados: sugerencias del formulario y opciones del filtro
function actualizarRubros() {
  const rubros = agruparPorRubro(productos).filter(g => g.nombre !== SIN_RUBRO);

  listaRubros.innerHTML = rubros
    .map(g => `<option value="${escapeHtml(g.nombre)}"></option>`)
    .join('');

  const seleccionado = filtroRubro.value;
  filtroRubro.innerHTML = '<option value="">Todos los rubros</option>' + rubros
    .map(g => `<option value="${escapeHtml(g.nombre)}">${escapeHtml(g.nombre)}</option>`)
    .join('');
  filtroRubro.value = rubros.some(g => g.nombre === seleccionado) ? seleccionado : '';
}

// ---------- Leer productos (SELECT) ----------
async function cargarProductos() {
  const { data, error } = await cliente
    .from('productos')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    console.error('Error al cargar productos:', error);
    contenedor.className = 'categorias';
    contenedor.innerHTML = '<p class="vacio">No se pudieron cargar los productos.</p>';
    mostrarMensaje('Error al leer la tabla "productos": ' + explicarError(error), 'error');
    return;
  }

  productos = data;

  // Si la tabla todavía tiene la estructura vieja, avisamos
  if (productos.length > 0 && !('rubro' in productos[0])) {
    mostrarMensaje('La tabla "productos" todavía tiene la estructura vieja. Ejecutá migracion.sql en Supabase (SQL Editor) y recargá.', 'error');
  }

  dibujarProductos();
}

// ---------- Dibujar (aplica buscador, filtro y vista) ----------
function dibujarProductos() {
  actualizarRubros();
  contenedor.className = 'categorias';

  if (productos.length === 0) {
    contenedor.innerHTML = '<p class="vacio">Todavía no hay productos.</p>';
    return;
  }

  const termino = normalizar(valorBuscador());
  const rubroElegido = claveRubro(filtroRubro.value);

  const filtrados = productos.filter(p => {
    const coincideRubro = !rubroElegido || claveRubro(p.rubro) === rubroElegido;
    const coincideTexto = !termino
      || normalizar(p.nombre).includes(termino)
      || normalizar(p.codigo_barras).includes(termino);
    return coincideRubro && coincideTexto;
  });

  if (filtrados.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No se encontraron productos con ese filtro.</p>';
    return;
  }

  if (vista === 'tabla') {
    contenedor.className = 'vista-tabla';
    contenedor.innerHTML = htmlTabla(filtrados);
  } else {
    contenedor.innerHTML = htmlColumnas(filtrados);
  }
}

function htmlCantidad(p) {
  return p.stock > 0 ? p.stock : '<span class="sin-stock">Sin stock</span>';
}

function htmlBotones(p) {
  return `
    <div class="acciones">
      <button type="button" data-accion="editar" data-id="${p.id}">Editar</button>
      <button type="button" data-accion="eliminar" data-id="${p.id}" class="peligro">Eliminar</button>
    </div>`;
}

// Vista 1: una columna por rubro
function htmlColumnas(lista) {
  return agruparPorRubro(lista).map(grupo => `
    <section class="columna">
      <h3>${escapeHtml(grupo.nombre)} <span class="contador">${grupo.items.length}</span></h3>
      <ul class="productos">
        ${grupo.items.map(p => `
          <li class="producto">
            <div class="producto-info">
              <strong>${escapeHtml(p.nombre)}</strong>
              ${p.subrubro ? `<span class="detalle">${escapeHtml(p.subrubro)}</span>` : ''}
              <span class="precio">$${Number(p.precio).toFixed(2)}</span>
              <span class="stock">Cantidad: ${htmlCantidad(p)}</span>
              ${p.codigo_barras ? `<span class="detalle">Cód: ${escapeHtml(p.codigo_barras)}</span>` : ''}
            </div>
            ${htmlBotones(p)}
          </li>
        `).join('')}
      </ul>
    </section>
  `).join('');
}

// Vista 2: tabla con las columnas de la guía del profe
function htmlTabla(lista) {
  return `
    <div class="tabla-scroll card">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Cód. barras</th>
            <th>Nombre</th>
            <th>Rubro</th>
            <th>Subrubro</th>
            <th>Precio</th>
            <th>Cantidad</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${lista.map(p => `
            <tr>
              <td>${p.id}</td>
              <td>${escapeHtml(p.codigo_barras)}</td>
              <td><strong>${escapeHtml(p.nombre)}</strong></td>
              <td>${escapeHtml(p.rubro)}</td>
              <td>${escapeHtml(p.subrubro)}</td>
              <td>$${Number(p.precio).toFixed(2)}</td>
              <td>${htmlCantidad(p)}</td>
              <td>${htmlBotones(p)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function cambiarVista(nueva) {
  vista = nueva;
  btnVistaColumnas.classList.toggle('activo', vista === 'columnas');
  btnVistaTabla.classList.toggle('activo', vista === 'tabla');
  dibujarProductos();
}

// ---------- Agregar / actualizar (INSERT / UPDATE) ----------
async function guardarProducto(e) {
  e.preventDefault();
  ocultarMensaje();

  const id = document.getElementById('product-id').value;
  const producto = {
    codigo_barras: document.getElementById('codigo_barras').value.trim() || null,
    nombre: document.getElementById('nombre').value.trim(),
    rubro: document.getElementById('rubro').value.trim() || null,
    subrubro: document.getElementById('subrubro').value.trim() || null,
    precio: parseFloat(document.getElementById('precio').value),
    stock: parseInt(document.getElementById('stock').value, 10)
  };

  let error;
  if (id) {
    ({ error } = await cliente.from('productos').update(producto).eq('id', id));
  } else {
    ({ error } = await cliente.from('productos').insert([producto]));
  }

  if (error) {
    console.error('Error al guardar:', error);
    mostrarMensaje('No se pudo guardar: ' + explicarError(error), 'error');
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
  document.getElementById('codigo_barras').value = p.codigo_barras || '';
  document.getElementById('nombre').value = p.nombre;
  document.getElementById('rubro').value = p.rubro || '';
  document.getElementById('subrubro').value = p.subrubro || '';
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

  const { error } = await cliente.from('productos').delete().eq('id', id);

  if (error) {
    console.error('Error al eliminar:', error);
    mostrarMensaje('No se pudo eliminar: ' + explicarError(error), 'error');
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
filtroRubro.addEventListener('change', dibujarProductos);
btnVistaColumnas.addEventListener('click', () => cambiarVista('columnas'));
btnVistaTabla.addEventListener('click', () => cambiarVista('tabla'));

// Un solo listener para todos los botones Editar / Eliminar (sirve para las dos vistas)
contenedor.addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-accion]');
  if (!boton) return;

  const id = Number(boton.dataset.id);
  if (boton.dataset.accion === 'editar') editarProducto(id);
  if (boton.dataset.accion === 'eliminar') eliminarProducto(id);
});

// ---------- Inicio ----------
if (!cliente) {
  mostrarMensaje('No se pudo iniciar Supabase. Revisá que index.html cargue la librería y conexion.js.', 'error');
} else {
  cargarProductos();
}
