// Si algo falla, lo mostramos en la página en vez de quedarnos en "Cargando..."
window.addEventListener('error', (e) => {
  const caja = document.getElementById('mensaje');
  if (caja) {
    caja.textContent = 'Error en la página: ' + e.message;
    caja.className = 'mensaje error';
    caja.hidden = false;
  }
});

// Cliente de Supabase: funciona con el conexion.js nuevo (db) y con el viejo (supabaseClient)
const supa = (typeof db !== 'undefined' && db) || (typeof supabaseClient !== 'undefined' && supabaseClient) || null;

// ---------- Referencias al HTML ----------
const form = document.getElementById('cliente-form');
const contenedor = document.getElementById('cliente-list');
const mensaje = document.getElementById('mensaje');
const btnCancelar = document.getElementById('btn-cancelar');
const buscador = document.getElementById('buscador');

let clientes = []; // copia local para poder editar sin pasar datos por el HTML

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

// Pasa a minúsculas y saca las tildes, para que "jose" encuentre "José"
function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Traduce los errores de Supabase a mensajes entendibles
function explicarError(error) {
  if (error.code === '42P01' || error.code === 'PGRST205' || /Could not find the table|does not exist/i.test(error.message || '')) {
    return 'Falta crear la tabla "clientes". Ejecutá clientes.sql en Supabase (SQL Editor).';
  }
  return error.message;
}

// ---------- Leer clientes (SELECT) ----------
async function cargarClientes() {
  const { data, error } = await supa
    .from('clientes')
    .select('*')
    .order('nombre', { ascending: true });

  if (error) {
    console.error('Error al cargar clientes:', error);
    contenedor.innerHTML = '<p class="vacio">No se pudieron cargar los clientes.</p>';
    mostrarMensaje('Error al leer la tabla "clientes": ' + explicarError(error), 'error');
    return;
  }

  clientes = data;
  dibujarClientes();
}

// ---------- Dibujar la tabla (aplica el buscador) ----------
function dibujarClientes() {
  if (clientes.length === 0) {
    contenedor.innerHTML = '<p class="vacio">Todavía no hay clientes. Agregá el primero con el formulario de arriba.</p>';
    return;
  }

  const termino = normalizar(buscador.value.trim());
  const filtrados = termino
    ? clientes.filter(c => normalizar(c.nombre).includes(termino) || normalizar(c.telefono).includes(termino))
    : clientes;

  if (filtrados.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No se encontraron clientes con ese filtro.</p>';
    return;
  }

  contenedor.innerHTML = `
    <div class="tabla-scroll card">
      <table>
        <thead>
          <tr><th>ID</th><th>Nombre</th><th>Teléfono</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          ${filtrados.map(c => `
            <tr>
              <td>${c.id}</td>
              <td><strong>${escapeHtml(c.nombre)}</strong></td>
              <td>${c.telefono
                ? `<a href="tel:${encodeURIComponent(c.telefono.replace(/[^\d+]/g, ''))}">${escapeHtml(c.telefono)}</a>`
                : '<span class="detalle">Sin teléfono</span>'}</td>
              <td>
                <div class="acciones">
                  <button type="button" data-accion="editar" data-id="${c.id}">Editar</button>
                  <button type="button" data-accion="eliminar" data-id="${c.id}" class="peligro">Eliminar</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

// ---------- Agregar / actualizar (INSERT / UPDATE) ----------
async function guardarCliente(e) {
  e.preventDefault();
  ocultarMensaje();

  const id = document.getElementById('cliente-id').value;
  const nombre = document.getElementById('nombre').value.trim();
  const telefono = document.getElementById('telefono').value.trim();

  if (!nombre) {
    mostrarMensaje('El nombre es obligatorio.', 'error');
    return;
  }
  if (telefono && !/^[\d\s()+-]{6,20}$/.test(telefono)) {
    mostrarMensaje('El teléfono solo puede tener números, espacios, + , - y paréntesis (entre 6 y 20 caracteres).', 'error');
    return;
  }

  const cliente = { nombre, telefono: telefono || null };

  let error;
  if (id) {
    ({ error } = await supa.from('clientes').update(cliente).eq('id', id));
  } else {
    ({ error } = await supa.from('clientes').insert([cliente]));
  }

  if (error) {
    console.error('Error al guardar:', error);
    mostrarMensaje('No se pudo guardar: ' + explicarError(error), 'error');
    return;
  }

  mostrarMensaje(id ? 'Cliente actualizado.' : 'Cliente agregado.', 'ok');
  limpiarFormulario();
  cargarClientes();
}

// ---------- Editar: pasa los datos al formulario ----------
function editarCliente(id) {
  const c = clientes.find(item => item.id === id);
  if (!c) return;

  document.getElementById('cliente-id').value = c.id;
  document.getElementById('nombre').value = c.nombre;
  document.getElementById('telefono').value = c.telefono || '';

  document.getElementById('form-title').textContent = 'Editar cliente';
  document.getElementById('btn-submit').textContent = 'Guardar cambios';
  btnCancelar.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Eliminar (DELETE) ----------
async function eliminarCliente(id) {
  if (!confirm('¿Seguro que querés eliminar este cliente?')) return;

  const { error } = await supa.from('clientes').delete().eq('id', id);

  if (error) {
    console.error('Error al eliminar:', error);
    mostrarMensaje('No se pudo eliminar: ' + explicarError(error), 'error');
    return;
  }

  mostrarMensaje('Cliente eliminado.', 'ok');
  cargarClientes();
}

// ---------- Limpiar formulario ----------
function limpiarFormulario() {
  form.reset();
  document.getElementById('cliente-id').value = '';
  document.getElementById('form-title').textContent = 'Agregar cliente';
  document.getElementById('btn-submit').textContent = 'Guardar cliente';
  btnCancelar.hidden = true;
}

// ---------- Eventos ----------
form.addEventListener('submit', guardarCliente);
btnCancelar.addEventListener('click', limpiarFormulario);
buscador.addEventListener('input', dibujarClientes);

contenedor.addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-accion]');
  if (!boton) return;

  const id = Number(boton.dataset.id);
  if (boton.dataset.accion === 'editar') editarCliente(id);
  if (boton.dataset.accion === 'eliminar') eliminarCliente(id);
});

// ---------- Inicio ----------
if (!supa) {
  mostrarMensaje('No se pudo iniciar Supabase. Revisá que clientes.html cargue la librería y conexion.js.', 'error');
} else {
  cargarClientes();
}