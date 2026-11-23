/* =============================================================================
   Cafetería Origen — lógica del panel de administración
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var usuario = null;
  var productosCache = {};
  var csrfTokenCache = null;

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  function money(valor) {
    return Number(valor || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
  }

  function crearElemento(tag, clase, texto) {
    var el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined && texto !== null) el.textContent = String(texto);
    return el;
  }

  function limpiarNodo(nodo) {
    while (nodo.firstChild) {
      nodo.removeChild(nodo.firstChild);
    }
  }

  function obtenerCsrf() {
    if (csrfTokenCache) return Promise.resolve(csrfTokenCache);
    return fetch(API + '/csrf-token', { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        csrfTokenCache = data.token || data.csrfToken || '';
        return csrfTokenCache;
      })
      .catch(function () { return ''; });
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
    var opts = Object.assign({ credentials: 'same-origin' }, opciones || {});
    return fetch(API + url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function enviarConCsrf(metodo, url, cuerpo) {
    return obtenerCsrf().then(function (token) {
      var payload = Object.assign({}, cuerpo || {}, { _csrf: token });
      return api(url, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        body: JSON.stringify(payload),
      });
    });
  }

  function postJSON(url, cuerpo) { return enviarConCsrf('POST', url, cuerpo); }
  function putJSON(url, cuerpo) { return enviarConCsrf('PUT', url, cuerpo); }
  function patchJSON(url, cuerpo) { return enviarConCsrf('PATCH', url, cuerpo); }
  function deleteJSON(url) { return enviarConCsrf('DELETE', url, {}); }

  function feedback(el, mensaje, ok) {
    el.className = 'form-feedback ' + (ok ? 'is-ok' : 'is-error');
    el.textContent = mensaje;
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

    var userEl = $('#admin-user');
    limpiarNodo(userEl);
    userEl.appendChild(document.createTextNode('Sesión de '));
    userEl.appendChild(crearElemento('strong', null, usuario.nombre || ''));
    userEl.appendChild(document.createTextNode(' · rol: '));
    userEl.appendChild(crearElemento('strong', null, usuario.rol || ''));

    $('#panel-bienvenida').textContent = 'Hola, ' + (usuario.nombre || '');
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
    limpiarNodo(contenedor);
    kpis.forEach(function (k) {
      var box = crearElemento('div', 'kpi');
      box.appendChild(crearElemento('div', 'kpi-label', k.label));
      box.appendChild(crearElemento('div', 'kpi-value', String(k.value)));
      contenedor.appendChild(box);
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
              value: mas ? mas.nombre : '—',
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
    limpiarNodo(tabla);

    if (!filas || filas.length === 0) {
      var p = crearElemento('p', 'empty', 'No hay pedidos.');
      tabla.appendChild(p);
      return;
    }

    var thead = document.createElement('thead');
    var trHead = document.createElement('tr');
    ['#', 'Mesa', 'Cliente', 'Estado', 'Total', 'Fecha'].forEach(function (col, idx) {
      var th = crearElemento('th', idx === 4 ? 'num' : null, col);
      trHead.appendChild(th);
    });
    if (conAcciones) trHead.appendChild(crearElemento('th', null, 'Acciones'));
    thead.appendChild(trHead);

    var tbody = document.createElement('tbody');
    filas.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.appendChild(crearElemento('td', null, p.id));
      tr.appendChild(crearElemento('td', null, p.mesa));
      tr.appendChild(crearElemento('td', null, p.cliente));

      var tdEstado = document.createElement('td');
      tdEstado.appendChild(crearElemento('span', 'badge badge-' + p.estado, p.estado));
      tr.appendChild(tdEstado);

      tr.appendChild(crearElemento('td', 'num', money(p.total)));
      tr.appendChild(crearElemento('td', null, new Date(p.creado_en).toLocaleString('es-AR')));

      if (conAcciones) {
        var tdAcc = document.createElement('td');
        var sel = crearElemento('select', 'sel-estado');
        sel.setAttribute('data-pedido', String(p.id));
        ['abierto', 'preparando', 'listo', 'entregado'].forEach(function (e) {
          var opt = crearElemento('option', null, e);
          opt.value = e;
          if (e === p.estado) opt.selected = true;
          sel.appendChild(opt);
        });
        tdAcc.appendChild(sel);
        tr.appendChild(tdAcc);
      }

      tbody.appendChild(tr);
    });

    tabla.appendChild(thead);
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
      limpiarNodo(tabla);

      var thead = document.createElement('thead');
      var trHead = document.createElement('tr');
      ['#', 'Nombre', 'Tipo', 'Origen', 'Precio', 'Acciones'].forEach(function (col, idx) {
        trHead.appendChild(crearElemento('th', idx === 4 ? 'num' : null, col));
      });
      thead.appendChild(trHead);

      var tbody = document.createElement('tbody');
      productos.forEach(function (p) {
        productosCache[p.id] = p;
        var tr = document.createElement('tr');
        tr.appendChild(crearElemento('td', null, p.id));
        tr.appendChild(crearElemento('td', null, p.nombre));
        tr.appendChild(crearElemento('td', null, p.tipo));
        tr.appendChild(crearElemento('td', null, p.variedad || '—'));
        tr.appendChild(crearElemento('td', 'num', money(p.precio)));

        var tdAcc = document.createElement('td');
        var btn = crearElemento('button', 'link-danger', 'Borrar');
        btn.setAttribute('data-borrar', String(p.id));
        tdAcc.appendChild(btn);
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
      });

      tabla.appendChild(thead);
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

    deleteJSON('/admin/productos/' + id).then(function (resp) {
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
            { label: 'Más vendido', value: mas ? mas.nombre + ' (' + mas.unidades + ')' : '—' },
          ];
          renderKpis($('#kpis-reportes'), kpis);
        });
      });
    });
  }

  function consultarVentas() {
    var caja = $('#reporte-feedback');
    var variedad = $('#reporte-variedad').value;
    var tabla = $('#tabla-ventas');

    api('/reportes/ventas-por-variedad?variedad=' + encodeURIComponent(variedad)).then(function (resp) {
      limpiarNodo(tabla);
      if (!resp.ok) {
        feedback(caja, 'Error: ' + (resp.data.error || 'desconocido'), false);
        return;
      }

      var ventas = resp.data.ventas || [];
      var thead = document.createElement('thead');
      var trHead = document.createElement('tr');
      ['Origen', 'Producto', 'Unidades', 'Total'].forEach(function (col, idx) {
        trHead.appendChild(crearElemento('th', idx >= 2 ? 'num' : null, col));
      });
      thead.appendChild(trHead);

      var tbody = document.createElement('tbody');
      ventas.forEach(function (v) {
        var tr = document.createElement('tr');
        tr.appendChild(crearElemento('td', null, v.variedad));
        tr.appendChild(crearElemento('td', null, v.nombre));
        tr.appendChild(crearElemento('td', 'num', v.unidades));
        tr.appendChild(crearElemento('td', 'num', money(v.total)));
        tbody.appendChild(tr);
      });

      tabla.appendChild(thead);
      tabla.appendChild(tbody);
      feedback(caja, 'Consulta realizada.', true);
    });
  }

  /* -------------------------------------------------------------- usuarios */
  function cargarUsuarios() {
    api('/admin/usuarios').then(function (resp) {
      var usuarios = resp.data.usuarios || [];
      var tabla = $('#tabla-usuarios');
      limpiarNodo(tabla);

      var thead = document.createElement('thead');
      var trHead = document.createElement('tr');
      ['#', 'Usuario', 'Nombre', 'Rol', 'Acciones'].forEach(function (col) {
        trHead.appendChild(crearElemento('th', null, col));
      });
      thead.appendChild(trHead);

      var tbody = document.createElement('tbody');
      usuarios.forEach(function (u) {
        var tr = document.createElement('tr');
        tr.appendChild(crearElemento('td', null, u.id));
        tr.appendChild(crearElemento('td', null, u.username));
        tr.appendChild(crearElemento('td', null, u.nombre || ''));

        var tdRol = document.createElement('td');
        tdRol.appendChild(crearElemento('span', 'badge' + (u.rol === 'admin' ? ' badge-admin' : ''), u.rol));
        tr.appendChild(tdRol);

        var tdAcc = document.createElement('td');
        var sel = crearElemento('select', 'sel-rol');
        sel.setAttribute('data-usuario', String(u.id));
        ['cliente', 'mozo', 'barista', 'admin'].forEach(function (r) {
          var opt = crearElemento('option', null, r);
          opt.value = r;
          if (r === u.rol) opt.selected = true;
          sel.appendChild(opt);
        });
        tdAcc.appendChild(sel);
        tr.appendChild(tdAcc);

        tbody.appendChild(tr);
      });

      tabla.appendChild(thead);
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
    obtenerCsrf();

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