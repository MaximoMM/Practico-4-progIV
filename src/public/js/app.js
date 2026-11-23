/* =============================================================================
   Cafetería Origen — lógica del sitio público
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var CARRITO_KEY = 'origen.carrito';
  var csrfTokenCache = null;

  var estado = {
    tipo: '',
    variedad: '',
    q: '',
    carrito: cargarCarrito(),
  };

  /* ---------------------------------------------------------------- utils */
  function $(sel) { return document.querySelector(sel); }

  function money(valor) {
    var n = Number(valor || 0);
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
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

  function api(url, opciones) {
    var opts = Object.assign({ credentials: 'same-origin' }, opciones || {});
    return fetch(API + url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  function postJSON(url, cuerpo) {
    return obtenerCsrf().then(function (token) {
      var payload = Object.assign({}, cuerpo || {}, { _csrf: token });
      return api(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        body: JSON.stringify(payload),
      });
    });
  }

  function guardarCarrito() {
    try {
      localStorage.setItem(CARRITO_KEY, JSON.stringify(estado.carrito));
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function cargarCarrito() {
    try {
      return JSON.parse(localStorage.getItem(CARRITO_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  /* ------------------------------------------------------------- catálogo */
  function urlCatalogo() {
    var params = new URLSearchParams();
    if (estado.tipo) params.set('tipo', estado.tipo);
    if (estado.variedad) params.set('variedad', estado.variedad);
    if (estado.q) params.set('q', estado.q);
    var s = params.toString();
    return '/productos' + (s ? '?' + s : '');
  }

  function cargarProductos() {
    return api(urlCatalogo()).then(function (resp) {
      if (!resp.ok) {
        renderErrorProductos(resp.data && resp.data.error);
        return;
      }
      renderProductos(resp.data.productos);
      renderResultado(resp.data.filtros, resp.data.total);
    });
  }

  function crearTag(texto, claseExtra) {
    var span = document.createElement('span');
    span.className = 'tag' + (claseExtra ? ' ' + claseExtra : '');
    span.textContent = texto == null ? '' : String(texto);
    return span;
  }

  function renderProductos(productos) {
    var grid = $('#productos-grid');
    limpiarNodo(grid);

    if (!productos || productos.length === 0) {
      grid.appendChild(crearElemento('p', 'empty', 'No encontramos productos con esos filtros.'));
      return;
    }

    productos.forEach(function (p) {
      window.__productos[p.id] = p;

      var card = crearElemento('article', 'product-card');

      var top = crearElemento('div', 'product-top');
      top.appendChild(crearElemento('h3', 'product-name', p.nombre));
      top.appendChild(crearElemento('span', 'product-price', money(p.precio)));

      var tags = crearElemento('div', 'product-tags');
      tags.appendChild(crearElemento('span', 'tag', p.tipo));
      if (p.variedad) tags.appendChild(crearElemento('span', 'tag tag-origen', p.variedad));
      if (p.tamano) tags.appendChild(crearElemento('span', 'tag', p.tamano));

      var desc = crearElemento('p', 'product-desc', p.descripcion);

      var btn = crearElemento('button', 'btn btn-ghost btn-agregar', 'Agregar');
      btn.setAttribute('data-id', String(p.id));

      card.appendChild(top);
      card.appendChild(tags);
      card.appendChild(desc);
      card.appendChild(btn);
      grid.appendChild(card);
    });
  }

  function renderResultado(filtros, total) {
    var el = $('#resultado-busqueda');

    if (filtros && filtros.q) {
      var strong = document.createElement('strong');
      strong.textContent = filtros.q;

      el.textContent = 'Resultados para ';
      el.appendChild(strong);
      el.appendChild(document.createTextNode(' — ' + total + ' producto(s)'));
    } else {
      el.textContent = total + ' producto(s) en el menú';
    }
  }

  function renderErrorProductos(mensaje) {
    var grid = $('#productos-grid');
    limpiarNodo(grid);
    grid.appendChild(
      crearElemento('p', 'empty', 'No se pudo cargar el menú: ' + (mensaje || 'error desconocido'))
    );
  }

  /* --------------------------------------------------------------- carrito */
  function agregarAlCarrito(productoId) {
    var existente = null;
    for (var i = 0; i < estado.carrito.length; i++) {
      if (String(estado.carrito[i].id) === String(productoId)) existente = estado.carrito[i];
    }
    if (existente) {
      existente.cantidad += 1;
    } else {
      estado.carrito.push({
        id: productoId,
        nombre: window.__productos[productoId] ? window.__productos[productoId].nombre : 'Producto',
        precio: window.__productos[productoId] ? window.__productos[productoId].precio : 0,
        cantidad: 1,
      });
    }
    guardarCarrito();
    renderCarrito();
  }

  function cambiarCantidad(indice, delta) {
    var item = estado.carrito[indice];
    if (!item) return;
    item.cantidad += delta;
    if (item.cantidad <= 0) estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function quitarDelCarrito(indice) {
    estado.carrito.splice(indice, 1);
    guardarCarrito();
    renderCarrito();
  }

  function renderCarrito() {
    var cont = $('#carrito');
    var lista = $('#resumen-carrito');
    var total = 0;

    limpiarNodo(cont);
    limpiarNodo(lista);

    if (estado.carrito.length === 0) {
      cont.appendChild(crearElemento('p', 'empty', 'El carrito está vacío.'));
      $('#resumen-total').textContent = money(0);
      return;
    }

    estado.carrito.forEach(function (item, i) {
      var subtotal = item.precio * item.cantidad;
      total += subtotal;

      var row = crearElemento('div', 'cart-item');

      var info = document.createElement('div');
      info.appendChild(crearElemento('div', 'cart-item-name', item.nombre));
      info.appendChild(crearElemento('div', 'cart-item-meta', money(item.precio) + ' c/u'));

      var qty = crearElemento('div', 'qty-control');
      var btnMenos = crearElemento('button', null, '−');
      btnMenos.type = 'button';
      btnMenos.setAttribute('data-acc', 'menos');
      btnMenos.setAttribute('data-i', String(i));

      var spanCant = crearElemento('span', null, String(item.cantidad));

      var btnMas = crearElemento('button', null, '+');
      btnMas.type = 'button';
      btnMas.setAttribute('data-acc', 'mas');
      btnMas.setAttribute('data-i', String(i));

      qty.appendChild(btnMenos);
      qty.appendChild(spanCant);
      qty.appendChild(btnMas);

      var acciones = document.createElement('div');
      acciones.appendChild(crearElemento('div', 'cart-item-price', money(subtotal)));
      var btnQuitar = crearElemento('button', 'link-danger', 'Quitar');
      btnQuitar.type = 'button';
      btnQuitar.setAttribute('data-acc', 'quitar');
      btnQuitar.setAttribute('data-i', String(i));
      acciones.appendChild(btnQuitar);

      row.appendChild(info);
      row.appendChild(qty);
      row.appendChild(acciones);
      cont.appendChild(row);

      var li = document.createElement('li');
      li.appendChild(crearElemento('span', null, item.nombre + ' × ' + item.cantidad));
      li.appendChild(crearElemento('span', null, money(subtotal)));
      lista.appendChild(li);
    });

    $('#resumen-total').textContent = money(total);
  }

  /* ---------------------------------------------------------------- pedidos */
  function enviarPedido(evento) {
    evento.preventDefault();
    var feedback = $('#pedido-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Enviando…';

    postJSON('/pedidos', {
      mesa: $('#pedido-mesa').value,
      cliente: $('#pedido-cliente').value,
      items: estado.carrito.map(function (item) {
        return { productoId: item.id, cantidad: item.cantidad };
      }),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No pudimos enviar el pedido: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Pedido #' + resp.data.id + ' recibido! Total ' + money(resp.data.total) +
        '. Te atendemos en la mesa ' + resp.data.mesa + '.';
      estado.carrito = [];
      guardarCarrito();
      renderCarrito();
      $('#form-pedido').reset();
    }).catch(function () {
      feedback.className = 'form-feedback is-error';
      feedback.textContent = 'Error de conexión con el servidor.';
    });
  }

  /* --------------------------------------------------------------- reseñas */
  function cargarReseñas() {
    return api('/comentarios').then(function (resp) {
      var cont = $('#lista-resenas');
      limpiarNodo(cont);

      if (!resp.ok || !resp.data.comentarios || resp.data.comentarios.length === 0) {
        cont.appendChild(crearElemento('p', 'empty', 'Todavía no hay reseñas. ¡Sé el primero!'));
        return;
      }

      resp.data.comentarios.forEach(function (c) {
        var estrellas = '';
        var cantidadEstrellas = Math.max(0, Math.min(5, Number(c.calificacion || 0)));
        for (var i = 0; i < cantidadEstrellas; i++) estrellas += '★';

        var article = crearElemento('article', 'review');
        var head = crearElemento('div', 'review-head');
        head.appendChild(crearElemento('span', 'review-author', c.autor || ''));
        head.appendChild(crearElemento('span', 'review-stars', estrellas));

        article.appendChild(head);
        article.appendChild(crearElemento('p', 'review-text', c.texto || ''));
        cont.appendChild(article);
      });
    });
  }

  function enviarReseña(evento) {
    evento.preventDefault();
    var feedback = $('#resena-feedback');
    feedback.className = 'form-feedback';
    feedback.textContent = 'Publicando…';

    postJSON('/comentarios', {
      autor: $('#resena-autor').value,
      texto: $('#resena-texto').value,
      calificacion: Number($('#resena-calificacion').value),
    }).then(function (resp) {
      if (!resp.ok) {
        feedback.className = 'form-feedback is-error';
        feedback.textContent = 'No se pudo publicar: ' + (resp.data.error || 'error desconocido');
        return;
      }
      feedback.className = 'form-feedback is-ok';
      feedback.textContent = '¡Gracias por tu reseña!';
      $('#form-resena').reset();
      cargarReseñas();
    });
  }

  /* ------------------------------------------------------------- listeners */
  function init() {
    window.__productos = {};
    obtenerCsrf();

    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        estado.tipo = chip.getAttribute('data-tipo');
        cargarProductos();
      });
    });

    $('#filtro-variedad').addEventListener('change', function (e) {
      estado.variedad = e.target.value;
      cargarProductos();
    });

    var temporizador = null;
    $('#filtro-busqueda').addEventListener('input', function (e) {
      estado.q = e.target.value;
      clearTimeout(temporizador);
      temporizador = setTimeout(cargarProductos, 250);
    });

    $('#productos-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-agregar');
      if (!btn) return;
      agregarAlCarrito(btn.getAttribute('data-id'));
    });

    $('#carrito').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var i = Number(btn.getAttribute('data-i'));
      var accion = btn.getAttribute('data-acc');
      if (accion === 'mas') cambiarCantidad(i, 1);
      else if (accion === 'menos') cambiarCantidad(i, -1);
      else if (accion === 'quitar') quitarDelCarrito(i);
    });

    $('#form-pedido').addEventListener('submit', enviarPedido);
    $('#form-resena').addEventListener('submit', enviarReseña);

    api(urlCatalogo()).then(function (resp) {
      if (resp.ok) {
        (resp.data.productos || []).forEach(function (p) { window.__productos[p.id] = p; });
        renderProductos(resp.data.productos);
        renderResultado(resp.data.filtros, resp.data.total);
      } else {
        renderErrorProductos(resp.data.error);
      }
    });
    cargarReseñas();
    renderCarrito();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();