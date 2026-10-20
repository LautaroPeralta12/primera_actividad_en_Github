document.addEventListener('DOMContentLoaded', () => {
  loadProducts();

  const form = document.getElementById('product-form');
  form.addEventListener('submit', handleFormSubmit);
});

// Cargar productos desde Supabase (Lectura)
async function loadProducts() {
  const { data, error } = await supabaseClient
    .from('productos')
    .select('*')
    .order('created_at', { ascending: false });

  const tbody = document.getElementById('product-list');

  if (error) {
    console.error('Error al cargar productos:', error);
    tbody.innerHTML = '<tr><td colspan="5">Error al cargar datos.</td></tr>';
    return;
  }

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay productos registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(p => `
    <tr>
      <td><strong>${p.nombre}</strong></td>
      <td>${p.categoria || 'Sin categoría'}</td>
      <td>$${parseFloat(p.precio).toFixed(2)}</td>
      <td>${p.stock > 0 ? p.stock : '<span class="badge-out">Sin Stock</span>'}</td>
      <td class="actions">
        <button onclick="editProduct(${p.id}, '${escapeQuotes(p.nombre)}', ${p.precio}, ${p.stock}, '${escapeQuotes(p.categoria || '')}')">Editar / Actualizar</button>
        <button class="btn-cancel" onclick="deleteProduct(${p.id})">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

// Agregar o actualizar un producto (Escritura)
async function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('product-id').value;
  const nombre = document.getElementById('nombre').value.trim();
  const precio = parseFloat(document.getElementById('precio').value);
  const stock = parseInt(document.getElementById('stock').value);
  const categoria = document.getElementById('categoria').value.trim();

  if (id) {
    // Actualizar producto existente
    const { error } = await supabaseClient
      .from('productos')
      .update({ nombre, precio, stock, categoria })
      .eq('id', id);

    if (error) {
      alert('Error al actualizar el producto: ' + error.message);
    } else {
      alert('Producto actualizado con éxito');
    }
  } else {
    // Insertar nuevo producto
    const { error } = await supabaseClient
      .from('productos')
      .insert([{ nombre, precio, stock, categoria }]);

    if (error) {
      alert('Error al agregar el producto: ' + error.message);
    } else {
      alert('Producto agregado con éxito');
    }
  }

  resetForm();
  loadProducts();
}

// Cargar datos en el formulario para editar
function editProduct(id, nombre, precio, stock, categoria) {
  document.getElementById('product-id').value = id;
  document.getElementById('nombre').value = nombre;
  document.getElementById('precio').value = precio;
  document.getElementById('stock').value = stock;
  document.getElementById('categoria').value = categoria;

  document.getElementById('form-title').textContent = 'Editar Producto';
  document.getElementById('btn-submit').textContent = 'Guardar Cambios';
  document.getElementById('btn-cancel').style.display = 'inline-block';
}

// Eliminar un producto
async function deleteProduct(id) {
  if (!confirm('¿Seguro que deseas eliminar este producto?')) return;

  const { error } = await supabaseClient
    .from('productos')
    .delete()
    .eq('id', id);

  if (error) {
    alert('Error al eliminar producto: ' + error.message);
  } else {
    loadProducts();
  }
}

// Limpiar formulario
function resetForm() {
  document.getElementById('product-id').value = '';
  document.getElementById('product-form').reset();
  document.getElementById('form-title').textContent = 'Agregar Nuevo Producto';
  document.getElementById('btn-submit').textContent = 'Guardar Producto';
  document.getElementById('btn-cancel').style.display = 'none';
}

// Utilidad para escapar comillas en argumentos HTML
function escapeQuotes(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
