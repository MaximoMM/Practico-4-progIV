/* =============================================================================
   Cafetería Origen — lógica del sitio público
   ============================================================================= */
(function () {
  'use strict';

  var API = '/api';
  var CARRITO_KEY = 'origen.carrito';

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

  function raw(valor) {
    // FALLA: esta función NO escapa nada, devuelve el valor tal cual.
    // La forma correcta de renderizar texto del servidor es escaparHtml()
    // (o textContent en vez de innerHTML).
    return String(valor == null ? '' : valor);
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

  function escaparHtml(texto) {
    var div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
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
    grid.textContent = '';

    if (!productos || productos.length === 0) {
      var vacio = document.createElement('p');
      vacio.className = 'empty';
      vacio.textContent = 'No encontramos productos con esos filtros.';
      grid.appendChild(vacio);
      return;
    }

    productos.forEach(function (p) {
      window.__productos[p.id] = p;

      var article = document.createElement('article');
      article.className = 'product-card';

      var top = document.createElement('div');
      top.className = 'product-top';

      var nombreH3 = document.createElement('h3');
      nombreH3.className = 'product-name';
      nombreH3.textContent = p.nombre == null ? '' : String(p.nombre);

      var precioSpan = document.createElement('span');
      precioSpan.className = 'product-price';
      precioSpan.textContent = money(p.precio);

      top.appendChild(nombreH3);
      top.appendChild(precioSpan);

      var tagsDiv = document.createElement('div');
      tagsDiv.className = 'product-tags';
      tagsDiv.appendChild(crearTag(p.tipo, ''));
      if (p.variedad) tagsDiv.appendChild(crearTag(p.variedad, 'tag-origen'));
      if (p.tamano) tagsDiv.appendChild(crearTag(p.tamano, ''));

      var descP = document.createElement('p');
      descP.className = 'product-desc';
      descP.textContent = p.descripcion == null ? '' : String(p.descripcion);

      var btnAgregar = document.createElement('button');
      btnAgregar.className = 'btn btn-ghost btn-agregar';
      btnAgregar.setAttribute('data-id', p.id == null ? '' : String(p.id));
      btnAgregar.textContent = 'Agregar';

      article.appendChild(top);
      article.appendChild(tagsDiv);
      article.appendChild(descP);
      article.appendChild(btnAgregar);
      grid.appendChild(article);
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
    grid.textContent = '';
    var p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No se pudo cargar el menú: ' + (mensaje || 'error desconocido');
    grid.appendChild(p);
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

    cont.textContent = '';
    lista.textContent = '';

    if (estado.carrito.length === 0) {
      var vacio = document.createElement('p');
      vacio.className = 'empty';
      vacio.textContent = 'El carrito está vacío.';
      cont.appendChild(vacio);
      $('#resumen-total').textContent = money(0);
      return;
    }

    estado.carrito.forEach(function (item, i) {
      var subtotal = item.precio * item.cantidad;
      total += subtotal;

      var row = document.createElement('div');
      row.className = 'cart-item';

      var infoDiv = document.createElement('div');
      var nameDiv = document.createElement('div');
      nameDiv.className = 'cart-item-name';
      nameDiv.textContent = item.nombre == null ? '' : String(item.nombre);

      var metaDiv = document.createElement('div');
      metaDiv.className = 'cart-item-meta';
      metaDiv.textContent = money(item.precio) + ' c/u';

      infoDiv.appendChild(nameDiv);
      infoDiv.appendChild(metaDiv);

      var qtyDiv = document.createElement('div');
      qtyDiv.className = 'qty-control';

      var btnMenos = document.createElement('button');
      btnMenos.type = 'button';
      btnMenos.setAttribute('data-acc', 'menos');
      btnMenos.setAttribute('data-i', String(i));
      btnMenos.textContent = '−';

      var qtySpan = document.createElement('span');
      qtySpan.textContent = String(item.cantidad);

      var btnMas = document.createElement('button');
      btnMas.type = 'button';
      btnMas.setAttribute('data-acc', 'mas');
      btnMas.setAttribute('data-i', String(i));
      btnMas.textContent = '+';

      qtyDiv.appendChild(btnMenos);
      qtyDiv.appendChild(qtySpan);
      qtyDiv.appendChild(btnMas);

      var priceDiv = document.createElement('div');
      var priceSub = document.createElement('div');
      priceSub.className = 'cart-item-price';
      priceSub.textContent = money(subtotal);

      var btnQuitar = document.createElement('button');
      btnQuitar.type = 'button';
      btnQuitar.className = 'link-danger';
      btnQuitar.setAttribute('data-acc', 'quitar');
      btnQuitar.setAttribute('data-i', String(i));
      btnQuitar.textContent = 'Quitar';

      priceDiv.appendChild(priceSub);
      priceDiv.appendChild(btnQuitar);

      row.appendChild(infoDiv);
      row.appendChild(qtyDiv);
      row.appendChild(priceDiv);
      cont.appendChild(row);

      var li = document.createElement('li');
      var liNombre = document.createElement('span');
      liNombre.textContent = (item.nombre == null ? '' : String(item.nombre)) + ' × ' + item.cantidad;
      var liTotal = document.createElement('span');
      liTotal.textContent = money(subtotal);
      li.appendChild(liNombre);
      li.appendChild(liTotal);
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
      cont.textContent = '';

      if (!resp.ok || !resp.data.comentarios || resp.data.comentarios.length === 0) {
        var vacio = document.createElement('p');
        vacio.className = 'empty';
        vacio.textContent = 'Todavía no hay reseñas. ¡Sé el primero!';
        cont.appendChild(vacio);
        return;
      }

      resp.data.comentarios.forEach(function (c) {
        var estrellas = '';
        var i;
        var cantidadEstrellas = Math.max(0, Math.min(5, Number(c.calificacion || 0)));
        for (i = 0; i < cantidadEstrellas; i++) estrellas += '★';

        var article = document.createElement('article');
        article.className = 'review';

        var head = document.createElement('div');
        head.className = 'review-head';

        var autorSpan = document.createElement('span');
        autorSpan.className = 'review-author';
        autorSpan.textContent = c.autor == null ? '' : String(c.autor);

        var estrellasSpan = document.createElement('span');
        estrellasSpan.className = 'review-stars';
        estrellasSpan.textContent = estrellas;

        var textoP = document.createElement('p');
        textoP.className = 'review-text';
        textoP.textContent = c.texto == null ? '' : String(c.texto);

        head.appendChild(autorSpan);
        head.appendChild(estrellasSpan);
        article.appendChild(head);
        article.appendChild(textoP);
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

    // Filtros
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

    // Carrito (delegación de eventos)
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

    // Carga inicial
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