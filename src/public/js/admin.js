/* =============================================================================
   Cafetería Origen — lógica del panel de administración
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var usuario = null;
  var productosCache = {};

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function money(valor) {
    return Number(valor || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  function raw(valor) {
    // FALLA: no escapa nada. Usar escaparHtml() / textContent.
    return String(valor == null ? '' : valor);
  }

  function escaparHtml(texto) {
    var div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  function textoSeguro(valor) {
    return valor == null ? '' : String(valor);
  }

  function crearElemento(tag, clase, texto) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = textoSeguro(texto);
    return el;
  }

  function api(url, opciones) {
    return fetch(API + url, opciones).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function postJSON(url, cuerpo) {
    return api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function putJSON(url, cuerpo) {
    return api(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function patchJSON(url, cuerpo) {
    return api(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function feedback(el, mensaje, ok) {
    el.className = 'form-feedback ' + (ok ? 'is-ok' : 'is-error');
    el.textContent = textoSeguro(mensaje);
  }

  /* ------------------------------------------------------------------ login */
  function iniciarSesion(evento) {
    evento.preventDefault();
    var caja = $('#login-feedback');
    caja.className = 'form-feedback';

    postJSON('/auth/login', {
      username: $('#login-usuario').value,
      password: $('#login-password').value,
    }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No pudimos iniciar sesión: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      usuario = resp.data.usuario;
      mostrarPanel();
    });
  }

  function cerrarSesion() {
    postJSON('/auth/logout', {}).then(function () {
      usuario = null;
      $('#vista-login').hidden = false;
      $('#vista-panel').hidden = true;
      $('#admin-user').textContent = '';
    });
  }

  function mostrarPanel() {
    $('#vista-login').hidden = true;
    $('#vista-panel').hidden = false;

    var adminUser = $('#admin-user');
    adminUser.textContent = '';
    adminUser.appendChild(document.createTextNode('Sesión de '));
    adminUser.appendChild(crearElemento('strong', '', usuario.nombre));
    adminUser.appendChild(document.createTextNode(' · rol: '));
    adminUser.appendChild(crearElemento('strong', '', usuario.rol));

    $('#panel-bienvenida').textContent = 'Hola, ' + textoSeguro(usuario.nombre);
    cargarTodo();
  }

  function cargarTodo() {
    cargarResumen();
    cargarPedidos();
    cargarProductos();
    cargarReportes();
    cargarUsuarios();
  }

  function renderKpis(contenedor, kpis) {
    contenedor.textContent = '';
    kpis.forEach(function (k) {
      var card = crearElemento('div', 'kpi');
      card.appendChild(crearElemento('div', 'kpi-label', k.label));
      card.appendChild(crearElemento('div', 'kpi-value', k.value));
      contenedor.appendChild(card);
    });
  }

  /* ---------------------------------------------------------------- resumen */
  function cargarResumen() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/mas-vendido').then(function (m) {
        api('/reportes/cantidad-vendida').then(function (c) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación total', value: money(f.data.facturado) },
            { label: 'Pedidos registrados', value: f.data.pedidos },
            {
              label: 'Producto más vendido',
              value: mas ? textoSeguro(mas.nombre) : '—',
            },
            {
              label: 'Unidades por tipo',
              value: Object.keys(c.data.cantidadVendida || {})
                .map(function (k) { return k + ': ' + c.data.cantidadVendida[k]; })
                .join(' · ') || '—',
            },
          ];

          renderKpis($('#kpis'), kpis);
        });
      });
    });
  }

  /* --------------------------------------------------------------- pedidos */
  function renderTablaPedidos(tabla, filas, conAcciones) {
    tabla.textContent = '';
    if (!filas || filas.length === 0) {
      tabla.appendChild(crearElemento('p', 'empty', 'No hay pedidos.'));
      return;
    }

    var thead = document.createElement('thead');
    var trHead = document.createElement('tr');
    ['#', 'Mesa', 'Cliente', 'Estado', 'Total', 'Fecha'].forEach(function (titulo, idx) {
      var th = crearElemento('th', idx === 4 ? 'num' : '', titulo);
      trHead.appendChild(th);
    });
    if (conAcciones) {
      trHead.appendChild(crearElemento('th', '', 'Acciones'));
    }
    thead.appendChild(trHead);
    tabla.appendChild(thead);

    var tbody = document.createElement('tbody');
    filas.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.appendChild(crearElemento('td', '', p.id));
      tr.appendChild(crearElemento('td', '', p.mesa));
      tr.appendChild(crearElemento('td', '', p.cliente));

      var tdEstado = document.createElement('td');
      tdEstado.appendChild(crearElemento('span', 'badge badge-' + textoSeguro(p.estado), p.estado));
      tr.appendChild(tdEstado);

      tr.appendChild(crearElemento('td', 'num', money(p.total)));
      tr.appendChild(crearElemento('td', '', new Date(p.creado_en).toLocaleString('es-AR')));

      if (conAcciones) {
        var tdAcc = document.createElement('td');
        var select = document.createElement('select');
        select.setAttribute('data-pedido', textoSeguro(p.id));
        select.className = 'sel-estado';

        ['abierto', 'preparando', 'listo', 'entregado'].forEach(function (e) {
          var opt = document.createElement('option');
          opt.value = e;
          opt.textContent = e;
          if (e === p.estado) opt.selected = true;
          select.appendChild(opt);
        });

        tdAcc.appendChild(select);
        tr.appendChild(tdAcc);
      }

      tbody.appendChild(tr);
    });

    tabla.appendChild(tbody);
  }

  function cargarPedidos() {
    api('/pedidos').then(function (resp) {
      var pedidos = resp.data.pedidos || [];
      renderTablaPedidos($('#tabla-pedidos'), pedidos, true);
      renderTablaPedidos($('#tabla-ultimos'), pedidos.slice(0, 5), false);
    });
  }

  function cambiarEstado(evento) {
    var select = evento.target.closest('.sel-estado');
    if (!select) return;
    var id = select.getAttribute('data-pedido');
    patchJSON('/pedidos/' + id + '/estado', { estado: select.value }).then(function (resp) {
      if (!resp.ok) {
        alert('No se pudo cambiar el estado: ' + (resp.data.error || 'error'));
      }
      cargarPedidos();
    });
  }

  /* ------------------------------------------------------------- productos */
  function cargarProductos() {
    api('/productos').then(function (resp) {
      var productos = resp.data.productos || [];
      productosCache = {};

      var tabla = $('#tabla-productos');
      tabla.textContent = '';

      var thead = document.createElement('thead');
      var trHead = document.createElement('tr');
      ['#', 'Nombre', 'Tipo', 'Origen', 'Precio', 'Acciones'].forEach(function (titulo, idx) {
        trHead.appendChild(crearElemento('th', idx === 4 ? 'num' : '', titulo));
      });
      thead.appendChild(trHead);
      tabla.appendChild(thead);

      var tbody = document.createElement('tbody');
      productos.forEach(function (p) {
        productosCache[p.id] = p;
        var tr = document.createElement('tr');
        tr.appendChild(crearElemento('td', '', p.id));
        tr.appendChild(crearElemento('td', '', p.nombre));
        tr.appendChild(crearElemento('td', '', p.tipo));
        tr.appendChild(crearElemento('td', '', p.variedad || '—'));
        tr.appendChild(crearElemento('td', 'num', money(p.precio)));

        var tdAcc = document.createElement('td');
        var btnBorrar = crearElemento('button', 'link-danger', 'Borrar');
        btnBorrar.setAttribute('data-borrar', textoSeguro(p.id));
        tdAcc.appendChild(btnBorrar);
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
      });

      tabla.appendChild(tbody);
    });
  }

  function guardarProducto(evento) {
    evento.preventDefault();
    var caja = $('#producto-feedback');
    var id = $('#producto-id').value;

    var cuerpo = {
      nombre: $('#p-nombre').value,
      tipo: $('#p-tipo').value,
      variedad: $('#p-variedad').value || null,
      tamano: $('#p-tamano').value || null,
      gramos: $('#p-gramos').value ? Number($('#p-gramos').value) : null,
      precio_base: Number($('#p-precio-base').value || 0),
      precio_por_gramo: Number($('#p-precio-gramo').value || 0),
      descripcion: $('#p-descripcion').value,
    };

    var peticion = id ? putJSON('/admin/productos/' + id, cuerpo) : postJSON('/admin/productos', cuerpo);

    peticion.then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo guardar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Producto guardado correctamente.', true);
      $('#form-producto').reset();
      $('#producto-id').value = '';
      cargarProductos();
    });
  }

  function borrarProducto(evento) {
    var btn = evento.target.closest('[data-borrar]');
    if (!btn) return;
    var id = btn.getAttribute('data-borrar');
    if (!confirm('¿Borrar el producto #' + id + '?')) return;

    api('/admin/productos/' + id, { method: 'DELETE' }).then(function (resp) {
      if (!resp.ok) alert('No se pudo borrar: ' + (resp.data.error || 'error'));
      cargarProductos();
    });
  }

  function limpiarFormularioProducto() {
    $('#form-producto').reset();
    $('#producto-id').value = '';
  }

  /* ---------------------------------------------------------------- upload */
  function subirArchivo(evento) {
    evento.preventDefault();
    var caja = $('#upload-feedback');
    var input = $('#archivo-subida');
    if (!input.files || !input.files[0]) {
      feedback(caja, 'Elegí un archivo primero.', false);
      return;
    }

    var archivo = input.files[0];
    var lector = new FileReader();

    lector.onload = function () {
      var base64 = String(lector.result).split(',')[1] || '';
      postJSON('/admin/subir-archivo', {
        nombre: archivo.name,
        contenidoBase64: base64,
      }).then(function (resp) {
        if (!resp.ok) {
          feedback(caja, 'No se pudo subir: ' + (resp.data.error || 'error desconocido'), false);
          return;
        }
        feedback(caja, 'Archivo subido a ' + resp.data.url, true);
      });
    };

    lector.readAsDataURL(archivo);
  }

  /* -------------------------------------------------------------- reportes */
  function cargarReportes() {
    api('/reportes/facturacion').then(function (f) {
      api('/reportes/ticket-promedio').then(function (t) {
        api('/reportes/mas-vendido').then(function (m) {
          var mas = m.data.producto;
          var kpis = [
            { label: 'Facturación', value: money(f.data.facturado) },
            { label: 'Pedidos', value: f.data.pedidos },
            { label: 'Ticket promedio', value: money(t.data.promedio) },
            { label: 'Más vendido', value: mas ? textoSeguro(mas.nombre) + ' (' + textoSeguro(mas.unidades) + ')' : '—' },
          ];
          renderKpis($('#kpis-reportes'), kpis);
        });
      });
    });
  }

  function consultarVentas() {
    var caja = $('#reporte-feedback');
    var variedad = $('#reporte-variedad').value;

    api('/reportes/ventas-por-variedad?variedad=' + encodeURIComponent(variedad)).then(function (resp) {
      var tabla = $('#tabla-ventas');
      if (!resp.ok) {
        feedback(caja, 'Error: ' + (resp.data.error || 'desconocido'), false);
        tabla.textContent = '';
        return;
      }
      var ventas = resp.data.ventas || [];
      tabla.textContent = '';

      var thead = document.createElement('thead');
      var trHead = document.createElement('tr');
      ['Origen', 'Producto', 'Unidades', 'Total'].forEach(function (titulo, idx) {
        trHead.appendChild(crearElemento('th', idx >= 2 ? 'num' : '', titulo));
      });
      thead.appendChild(trHead);
      tabla.appendChild(thead);

      var tbody = document.createElement('tbody');
      ventas.forEach(function (v) {
        var tr = document.createElement('tr');
        tr.appendChild(crearElemento('td', '', v.variedad));
        tr.appendChild(crearElemento('td', '', v.nombre));
        tr.appendChild(crearElemento('td', 'num', v.unidades));
        tr.appendChild(crearElemento('td', 'num', money(v.total)));
        tbody.appendChild(tr);
      });
      tabla.appendChild(tbody);

      feedback(caja, 'Consulta realizada.', true);
    });
  }

  /* -------------------------------------------------------------- usuarios */
  function cargarUsuarios() {
    api('/admin/usuarios').then(function (resp) {
      var usuarios = resp.data.usuarios || [];
      var tabla = $('#tabla-usuarios');
      tabla.textContent = '';

      var thead = document.createElement('thead');
      var trHead = document.createElement('tr');
      ['#', 'Usuario', 'Nombre', 'Rol', 'Acciones'].forEach(function (titulo) {
        trHead.appendChild(crearElemento('th', '', titulo));
      });
      thead.appendChild(trHead);
      tabla.appendChild(thead);

      var tbody = document.createElement('tbody');
      usuarios.forEach(function (u) {
        var tr = document.createElement('tr');
        tr.appendChild(crearElemento('td', '', u.id));
        tr.appendChild(crearElemento('td', '', u.username));
        tr.appendChild(crearElemento('td', '', u.nombre));

        var tdRol = document.createElement('td');
        var badgeClase = 'badge' + (u.rol === 'admin' ? ' badge-admin' : '');
        tdRol.appendChild(crearElemento('span', badgeClase, u.rol));
        tr.appendChild(tdRol);

        var tdAcc = document.createElement('td');
        var select = document.createElement('select');
        select.setAttribute('data-usuario', textoSeguro(u.id));
        select.className = 'sel-rol';

        ['cliente', 'mozo', 'barista', 'admin'].forEach(function (r) {
          var opt = document.createElement('option');
          opt.value = r;
          opt.textContent = r;
          if (r === u.rol) opt.selected = true;
          select.appendChild(opt);
        });

        tdAcc.appendChild(select);
        tr.appendChild(tdAcc);
        tbody.appendChild(tr);
      });

      tabla.appendChild(tbody);
    });
  }

  function cambiarRol(evento) {
    var select = evento.target.closest('.sel-rol');
    if (!select) return;
    var id = select.getAttribute('data-usuario');

    putJSON('/admin/usuarios/' + id, { rol: select.value }).then(function (resp) {
      if (!resp.ok) alert('No se pudo actualizar: ' + (resp.data.error || 'error'));
      cargarUsuarios();
    });
  }

  function cambiarPassword(evento) {
    evento.preventDefault();
    var caja = $('#password-feedback');
    postJSON('/admin/cambiar-contrasena', { nueva: $('#nueva-password').value }).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, 'No se pudo cambiar: ' + (resp.data.error || 'error desconocido'), false);
        return;
      }
      feedback(caja, 'Contraseña actualizada.', true);
      $('#nueva-password').value = '';
    });
  }

  /* ----------------------------------------------------------- herramientas */
  function probarConexion(evento) {
    evento.preventDefault();
    var salida = $('#salida-conexion');
    salida.textContent = 'Probando…';

    postJSON('/admin/probar-conexion', { host: $('#conexion-host').value }).then(function (resp) {
      if (!resp.ok) {
        salida.textContent = 'Error: ' + (resp.data.error || 'desconocido');
        return;
      }
      salida.textContent =
        '$ ' + resp.data.comando + '\n\n' +
        (resp.data.salida || '') +
        (resp.data.error ? '\n[stderr]\n' + resp.data.error : '');
    });
  }

  function verDiagnostico() {
    var salida = $('#salida-diagnostico');
    salida.textContent = 'Cargando…';
    api('/_diagnostico').then(function (resp) {
      salida.textContent = JSON.stringify(resp.data, null, 2);
    });
  }

  /* ------------------------------------------------------------------ tabs */
  function activarTab(evento) {
    var tab = evento.target.closest('.tab');
    if (!tab) return;
    var vista = tab.getAttribute('data-vista');
    $$('.tab').forEach(function (t) { t.classList.remove('is-active'); });
    tab.classList.add('is-active');
    $$('.tab-panel').forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-panel') === vista);
    });
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    var params = new URLSearchParams(window.location.search);
    var objetivo = params.get('vista');
    if (objetivo) {
      $('#panel-bienvenida').textContent = 'Panel ' + objetivo.slice(0, 60);
    }

    $('#form-login').addEventListener('submit', iniciarSesion);
    $('#btn-logout').addEventListener('click', cerrarSesion);
    $('#btn-refrescar').addEventListener('click', cargarTodo);
    $('#tabs').addEventListener('click', activarTab);
    $('#tabla-pedidos').addEventListener('change', cambiarEstado);
    $('#tabla-productos').addEventListener('click', borrarProducto);
    $('#form-producto').addEventListener('submit', guardarProducto);
    $('#btn-limpiar-producto').addEventListener('click', limpiarFormularioProducto);
    $('#form-upload').addEventListener('submit', subirArchivo);
    $('#form-password').addEventListener('submit', cambiarPassword);
    $('#btn-reporte-variedad').addEventListener('click', consultarVentas);
    $('#tabla-usuarios').addEventListener('change', cambiarRol);
    $('#form-conexion').addEventListener('submit', probarConexion);
    $('#btn-diagnostico').addEventListener('click', verDiagnostico);

    // ¿Ya hay sesión?
    api('/auth/yo').then(function (resp) {
      if (resp.ok) {
        usuario = resp.data.usuario;
        mostrarPanel();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();