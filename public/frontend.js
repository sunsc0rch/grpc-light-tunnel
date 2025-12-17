// public/frontend.js - ПОЛНЫЙ ИСПРАВЛЕННЫЙ ВАРИАНТ
(function() {
    'use strict';

    console.log('🚀 gRPC Tunnel Frontend Initializing...');

    const FRONTEND_VERSION = '4.0.1-complete-fixed';
    let globalClientId = null;
    let isProcessing = false;
    let tunnelClient = null;
    let mutationObserver = null;
    let bootstrapInitialized = false;
    let ajaxObserver = null;
    // ==================== КОНФИГУРАЦИЯ ====================
    const CONFIG = {
        debug: true,
        tunnelPath: '/tunnel/',
        serverUrl: window.location.origin,
        pollInterval: 1000,
        maxRetries: 3,
        enableMutationObserver: true,
        enableFormInterception: true,
        enableLinkInterception: true,
        enableXHRInterception: true
    };

    // ==================== УТИЛИТЫ ====================
    function log(...args) {
        if (CONFIG.debug) {
            console.log('🔧 [Tunnel]', ...args);
        }
    }

    function warn(...args) {
        console.warn('⚠️ [Tunnel]', ...args);
    }

    // ==================== ПРОВЕРКА ТИПА СТРАНИЦЫ ====================
    function isRootPage() {
        // Проверяем, находимся ли мы на корневой странице с элементами управления
        return document.getElementById('connectBtn') !== null ||
               document.getElementById('statusIndicator') !== null ||
               document.querySelector('.tunnel-controls') !== null ||
               (document.title && document.title.includes('gRPC Tunnel'));
    }

    function isTunnelPage() {
        // Проверяем, находимся ли мы на странице загруженной через туннель
        return window.location.pathname.includes('/tunnel/') ||
               document.body.innerHTML.includes('Wagtail') ||
               document.querySelector('form[action*="/accounts/"]') !== null ||
               document.querySelector('nav.navbar') !== null ||
               (document.body && !isRootPage());
    }
// ==================== ОБНОВЛЕННАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ ====================
function initializeBootstrapComponents(force = false) {
    if (bootstrapInitialized && !force) return;

    console.log(`🔄 Initializing Bootstrap components...`);
    const clientId = getAndEnsureClientId();
    if (!clientId) {
        console.log('⚠️ No client ID, skipping component initialization');
        return;
    }

    // === СИСТЕМА ОТСЛЕЖИВАНИЯ ЭЛЕМЕНТОВ ===
    // Используем WeakSet для отслеживания инициализированных элементов
    if (!window._tunnelInitializedElements) {
        window._tunnelInitializedElements = {
            dropdowns: new WeakSet(),
            forms: new WeakSet(),
            ajaxHandlers: new WeakSet(),
            navTogglers: new WeakSet()
        };
    }
    const tracker = window._tunnelInitializedElements;

    // === УЛУЧШЕННАЯ ИНИЦИАЛИЗАЦИЯ DROPDOWN (ТОЛЬКО НОВЫЕ) ===
    const dropdownSelectors = [
        '.dropdown-toggle:not([data-tunnel-initialized])',
        '[data-toggle="dropdown"]:not([data-tunnel-initialized])',
        '.nav-item.dropdown > a:not([data-tunnel-initialized])',
        '.menu-item-has-children > a:not([data-tunnel-initialized])'
    ];

    let newDropdownsCount = 0;
    dropdownSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(dropdown => {
            if (!tracker.dropdowns.has(dropdown)) {
                initializeSingleDropdown(dropdown, tracker);
                newDropdownsCount++;
            }
        });
    });

    // === ИНИЦИАЛИЗАЦИЯ НОВЫХ ФОРМ ===
    document.querySelectorAll('form:not([data-tunnel-initialized])').forEach(form => {
        if (!tracker.forms.has(form)) {
            initializeSingleForm(form, tracker);
        }
    });

    // === НАВБАР ТОГГЛЕРЫ (ТОЛЬКО НОВЫЕ) ===
    document.querySelectorAll('.navbar-toggler:not([data-tunnel-initialized])').forEach(toggler => {
        if (!tracker.navTogglers.has(toggler)) {
            initializeNavbarToggler(toggler, tracker);
        }
    });

    // === УНИВЕРСАЛЬНЫЙ AJAX ПЕРЕХВАТЧИК ===
    if (!tracker.ajaxHandlers.has(window) && window.jQuery) {
        initializeUniversalAjaxInterceptor(tracker);
    }

    // === УСТАНОВКА ГЛОБАЛЬНЫХ ОБРАБОТЧИКОВ (ОДИН РАЗ) ===
    if (!document.body.hasAttribute('data-dropdown-close-bound')) {
        setupGlobalCloseHandlers();
    }

    console.log(`✅ Bootstrap components initialized: ${newDropdownsCount} new dropdowns processed`);
    bootstrapInitialized = true;
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function initializeSingleDropdown(dropdown, tracker) {
    dropdown.setAttribute('data-tunnel-initialized', 'true');
    tracker.dropdowns.add(dropdown);

    // Сохраняем оригинальные обработчики, если они есть
    const originalOnClick = dropdown.onclick;

    dropdown.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const parent = this.closest('.dropdown, .nav-item.dropdown, [data-toggle="dropdown"]');
        let menu = null;

        // Поиск меню разными способами (универсально для разных CMS)
        if (this.nextElementSibling?.classList?.contains('dropdown-menu')) {
            menu = this.nextElementSibling;
        } else if (parent) {
            menu = parent.querySelector('.dropdown-menu, .sub-menu, .children');
        }

        if (menu) {
            const isExpanded = this.getAttribute('aria-expanded') === 'true' ||
                              menu.classList.contains('show') ||
                              menu.style.display === 'block';

            // Переключение текущего меню
            if (menu.classList) {
                menu.classList.toggle('show');
            }
            menu.style.display = isExpanded ? 'none' : 'block';
            this.setAttribute('aria-expanded', (!isExpanded).toString());

            // Закрытие других меню (только для Bootstrap-стиля)
            if (!isExpanded && menu.classList.contains('dropdown-menu')) {
                document.querySelectorAll('.dropdown-menu.show').forEach(otherMenu => {
                    if (otherMenu !== menu) {
                        otherMenu.classList.remove('show');
                        otherMenu.style.display = 'none';
                    }
                });
                document.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach(toggle => {
                    if (toggle !== this) {
                        toggle.setAttribute('aria-expanded', 'false');
                    }
                });
            }
        }

        // Вызов оригинального обработчика, если он был
        if (originalOnClick && typeof originalOnClick === 'function') {
            originalOnClick.call(this, e);
        }

        console.log(`🔘 Dropdown toggled: ${this.textContent.trim() || 'unnamed dropdown'}`);
    });
}

function initializeSingleForm(form, tracker) {
    form.setAttribute('data-tunnel-initialized', 'true');
    tracker.forms.add(form);

    // Используем вашу существующую логику, но адаптируем для всех форм
    const originalSubmit = form.onsubmit;

    form.addEventListener('submit', function(e) {
        // Пропускаем формы, которые уже обрабатываются вашей системой
        if (e.defaultPrevented) return;

        const action = this.getAttribute('action');
        const method = (this.getAttribute('method') || 'GET').toUpperCase();
        const clientId = getAndEnsureClientId();

        if (clientId && action && !isStaticAsset(action) &&
            !action.startsWith('http') && !action.startsWith('//')) {

            // Для AJAX-форм в CMS (например, поиск в WordPress)
            if (this.classList.contains('search-form') ||
                this.classList.contains('ajax-form') ||
                this.hasAttribute('data-ajax')) {

                e.preventDefault();

                const formData = new FormData(this);
                formData.append('client_id', clientId);

                // Определяем, это GET или POST
                if (method === 'GET') {
                    const params = new URLSearchParams(formData);
                    const url = `${action}?${params.toString()}&client_id=${clientId}`;
                    const fixedUrl = fixUrl(url, clientId);

                    fetch(fixedUrl, {
                        method: 'GET',
                        headers: {
                            'x-tunnel-client-id': clientId,
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                        },
                        credentials: 'include'
                    }).then(response => {
                        if (response.ok) return response.text();
                        throw new Error(`HTTP ${response.status}`);
                    }).then(html => {
                        // Для AJAX-форм обычно обновляется только часть страницы
                        const resultContainer = this.nextElementSibling?.classList?.contains('ajax-results')
                            ? this.nextElementSibling
                            : document.querySelector('.search-results, .ajax-results');

                        if (resultContainer) {
                            resultContainer.innerHTML = html;
                            // Реинициализируем компоненты в новом контенте
                            setTimeout(() => initializeBootstrapComponents(true), 50);
                        } else {
                            updatePageContent(html, fixedUrl);
                        }
                    }).catch(err => {
                        console.error('AJAX form submission failed:', err);
                    });
                }
            }
        }

        // Вызов оригинального обработчика
        if (originalSubmit && typeof originalSubmit === 'function') {
            originalSubmit.call(this, e);
        }
    });
}

function initializeNavbarToggler(toggler, tracker) {
    toggler.setAttribute('data-tunnel-initialized', 'true');
    tracker.navTogglers.add(toggler);

    toggler.addEventListener('click', function(e) {
        e.preventDefault();
        const target = this.getAttribute('data-bs-target') ||
                      this.getAttribute('data-target') ||
                      this.getAttribute('href');

        if (target) {
            const targetEl = document.querySelector(target);
            if (targetEl) {
                const isCollapsed = this.classList.contains('collapsed') ||
                                   !targetEl.classList.contains('show');

                if (isCollapsed) {
                    targetEl.classList.add('show');
                    targetEl.style.display = 'block';
                    this.classList.remove('collapsed');
                    this.setAttribute('aria-expanded', 'true');
                } else {
                    targetEl.classList.remove('show');
                    targetEl.style.display = 'none';
                    this.classList.add('collapsed');
                    this.setAttribute('aria-expanded', 'false');
                }
            }
        }
    });
}

function initializeUniversalAjaxInterceptor(tracker) {
    tracker.ajaxHandlers.add(window);

    jQuery(document).ajaxSend(function(event, xhr, settings) {
        const clientId = getAndEnsureClientId();
        if (clientId && settings.url && !settings.url.includes('/api/') && !isStaticAsset(settings.url)) {
            try {
                const url = new URL(settings.url, window.location.origin);

                // Не добавляем client_id к внешним URL или статическим файлам
                if (url.origin === window.location.origin && !isStaticAsset(url.pathname)) {
                    if (!url.searchParams.has('client_id')) {
                        url.searchParams.set('client_id', clientId);
                        settings.url = url.toString();
                    }

                    // Добавляем заголовок для туннеля
                    if (settings.headers) {
                        settings.headers['X-Tunnel-Client-Id'] = clientId;
                    } else {
                        settings.headers = { 'X-Tunnel-Client-Id': clientId };
                    }

                    // Добавляем CSRF для Django/Wagtail
                    const csrfToken = getCSRFToken();
                    if (csrfToken && !settings.headers['X-CSRFToken']) {
                        settings.headers['X-CSRFToken'] = csrfToken;
                    }
                }
            } catch (e) {
                console.warn('Could not process AJAX URL:', settings.url);
            }
        }
    });

    // Обработка успешных AJAX-запросов для реинициализации компонентов
    jQuery(document).ajaxComplete(function(event, xhr, settings) {
        if (xhr.status === 200 && settings.dataType !== 'json') {
            // Даем время DOM обновиться
            setTimeout(() => {
                initializeBootstrapComponents(true);
            }, 100);
        }
    });
}

function setupGlobalCloseHandlers() {
    document.body.setAttribute('data-dropdown-close-bound', 'true');

    document.addEventListener('click', function(e) {
        // Закрываем dropdown при клике вне
        if (!e.target.closest('.dropdown, .nav-item.dropdown')) {
            document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                menu.classList.remove('show');
                menu.style.display = 'none';
            });
            document.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach(toggle => {
                toggle.setAttribute('aria-expanded', 'false');
            });
        }
    });

    // Обработка клавиши Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                menu.classList.remove('show');
                menu.style.display = 'none';
                const toggle = menu.previousElementSibling;
                if (toggle && toggle.classList.contains('dropdown-toggle')) {
                    toggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
    });
}

// ==================== AJAX DOM OBSERVER (УЛУЧШЕННЫЙ) ====================
function setupAjaxDomObserver() {
    if (ajaxObserver) {
        ajaxObserver.disconnect();
    }

    ajaxObserver = new MutationObserver((mutations) => {
        let hasNewElements = false;

        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        // Быстрая проверка на новые компоненты
                        if (node.querySelector?.('.dropdown-toggle:not([data-tunnel-initialized])') ||
                            node.querySelector?.('.navbar-toggler:not([data-tunnel-initialized])') ||
                            node.querySelector?.('form:not([data-tunnel-initialized])') ||
                            (node.classList?.contains('dropdown-toggle') && !node.hasAttribute('data-tunnel-initialized')) ||
                            (node.classList?.contains('navbar-toggler') && !node.hasAttribute('data-tunnel-initialized')) ||
                            (node.tagName === 'FORM' && !node.hasAttribute('data-tunnel-initialized'))) {
                            hasNewElements = true;
                        }
                    }
                });
            }
        });

        if (hasNewElements) {
            console.log('🔄 New CMS components detected after dynamic update');
            // Инициализируем ТОЛЬКО новые элементы
            initializeBootstrapComponents(true);
        }
    });

    ajaxObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    });
}

function setupAjaxDomObserver() {
    ajaxObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length > 0) {
                // Проверяем, есть ли новые dropdown элементы
                let hasNewDropdowns = false;
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        if (node.querySelector?.('.dropdown-toggle:not([data-tunnel-initialized])') ||
                            (node.classList?.contains('dropdown-toggle') && !node.hasAttribute('data-tunnel-initialized'))) {
                            hasNewDropdowns = true;
                        }
                    }
                });

                if (hasNewDropdowns) {
                    console.log('🔄 New dropdowns detected after AJAX');
                    // Инициализируем ТОЛЬКО новые элементы
                    initializeBootstrapComponents(true);
                }
            }
        });
    });
}
    // ==================== СИНХРОНИЗАЦИЯ CLIENT_ID ====================
    function getAndEnsureClientId() {
        if (globalClientId) return globalClientId;

        // 1. Проверяем URL параметры ПЕРВЫМ делом
        const urlParams = new URLSearchParams(window.location.search);
        let clientId = urlParams.get('client_id');

        // 2. Проверяем localStorage
        if (!clientId) {
            clientId = localStorage.getItem('tunnel_client_id');
        }

        // 3. Проверяем куки
        if (!clientId && document.cookie) {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'tunnel_client_id') {
                    clientId = value;
                    break;
                }
            }
        }

        // 4. Проверяем tunnelClient
        if (!clientId && tunnelClient && tunnelClient.clientId) {
            clientId = tunnelClient.clientId;
        }

        if (clientId) {
            globalClientId = clientId;
            window.TUNNEL_CLIENT_ID = clientId;
            localStorage.setItem('tunnel_client_id', clientId);
            document.cookie = `tunnel_client_id=${clientId}; path=/; max-age=86400; SameSite=Lax`;
            log('Client ID initialized:', clientId);

            // Автоматически добавляем client_id к текущему URL если его нет
            addClientIdToCurrentUrl(clientId);
        }

        return clientId;
    }

    function saveClientId(clientId) {
        if (!clientId) return;

        globalClientId = clientId;
        window.TUNNEL_CLIENT_ID = clientId;

        // Сохраняем во все источники
        localStorage.setItem('tunnel_client_id', clientId);
        document.cookie = `tunnel_client_id=${clientId}; path=/; max-age=86400; SameSite=Lax`;

        // Добавляем client_id к текущему URL
        addClientIdToCurrentUrl(clientId);

        log('Saved client ID:', clientId);
    }

    // ==================== ФУНКЦИИ ДЛЯ РАБОТЫ С URL ====================
    function addClientIdToCurrentUrl(clientId) {
        if (!clientId) return;

        const currentUrl = new URL(window.location.href);
        const existingClientId = currentUrl.searchParams.get('client_id');

        if (existingClientId !== clientId) {
            currentUrl.searchParams.set('client_id', clientId);

            // Обновляем историю без перезагрузки страницы
            window.history.replaceState({}, '', currentUrl.toString());
            log('Added client_id to URL:', clientId);
        }
    }

    function addClientIdToUrl(url, clientId) {
        if (!url || !clientId || typeof url !== 'string') return url;

        try {
            // Для относительных URL используем текущий origin
            const baseUrl = url.startsWith('/') ? window.location.origin : undefined;
            const urlObj = new URL(url, baseUrl);

            // НЕ добавляем client_id к API путям (они обрабатываются напрямую)
            if (urlObj.pathname.startsWith('/api/')) {
                return url;
            }

            // НЕ добавляем client_id к статическим файлам
            if (isStaticAsset(urlObj.pathname)) {
                return url;
            }

            // НЕ добавляем client_id если он уже есть с таким же значением
            const existingClientId = urlObj.searchParams.get('client_id');
            if (existingClientId === clientId) {
                return urlObj.toString();
            }

            // Добавляем или заменяем client_id
            urlObj.searchParams.set('client_id', clientId);

            log(`Added client_id to URL: ${url} → ${urlObj.toString()}`);
            return urlObj.toString();

        } catch (e) {
            // Если не удалось распарсить URL, возвращаем как есть
            return url;
        }
    }

    // ==================== ФИКСАЦИЯ URL ====================
    function isStaticAsset(url) {
        if (!url || typeof url !== 'string') return false;

        const staticPatterns = [
            /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webp|avif|json)(\?.*)?$/i,
            /\/static\//i,
            /\/media\//i,
            /\/admin\/static\//i,
            /^\/api\//i,
            /^\/health$/i,
            /^\/status$/i,
            /^\/favicon\.ico$/i,
            /^\/tunnel\.TunnelService\//
        ];

        return staticPatterns.some(pattern => pattern.test(url));
    }

function fixUrl(url, clientId = null) {
    if (typeof url !== 'string') return url;

    // Пропускаем внешние ссылки и специальные URL
    if (url.startsWith('http://') || url.startsWith('https://') ||
        url.startsWith('//') || url.startsWith('#') ||
        url.startsWith('javascript:') || url.startsWith('/api/') ||
        url.startsWith('/tunnel.TunnelService/')) {
        return url;
    }

    if (isStaticAsset(url)) {
        return url;
    }

    // КОРНЕВОЙ ПУТЬ - НЕ ДОБАВЛЯЕМ /tunnel/
    if (url === '/' || url === '') {
        // Только добавляем client_id
        if (clientId) {
            const urlWithClientId = addClientIdToUrl(url, clientId);
            return urlWithClientId;
        }
        return url;
    }

    let fixedUrl = url;

  // Если это путь API или gRPC - не добавляем /tunnel/
  if (url.startsWith('/api/') || url.startsWith('/tunnel.TunnelService/')) {
    return url;
  }

  // Все относительные URL должны идти через /tunnel/
  if (url.startsWith('/') && !url.startsWith('/tunnel/') &&
      !url.startsWith('/static/') && !url.startsWith('/media/') &&
      !url.includes('.')) {

    // Сохраняем query параметры
    const pathname = url.split('?')[0];
    const search = url.includes('?') ? '?' + url.split('?')[1] : '';

    // Преобразуем путь
    fixedUrl = '/tunnel' + pathname + search;

    log(`Path fix: ${url} → ${fixedUrl}`);
  }

  // Добавляем client_id если есть
  if (clientId) {
    const urlWithClientId = addClientIdToUrl(fixedUrl, clientId);
    if (urlWithClientId !== fixedUrl) {
      log(`Added client_id: ${fixedUrl} → ${urlWithClientId}`);
    }
    return urlWithClientId;
  }

  return fixedUrl;
}

    // ==================== CSRF ОБРАБОТКА ====================
    function getCSRFToken() {
        // 1. Из куки
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'csrftoken') {
                return value;
            }
        }

        // 2. Из мета-тега
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag && metaTag.content) {
            return metaTag.content;
        }

        // 3. Из input в форме
        const csrfInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
        if (csrfInput && csrfInput.value) {
            return csrfInput.value;
        }

        return null;
    }

    // ==================== ПЕРЕХВАТ WINDOW.LOCATION (БЕЗОПАСНЫЙ) ====================
    function interceptLocationChanges() {
        try {
            // Делегирование событий для всех ссылок
            document.addEventListener('click', function(e) {
                const link = e.target.closest('a[href]');
                if (link && link.getAttribute('href') &&
                    !link.getAttribute('href').startsWith('http') &&
                    !link.getAttribute('href').startsWith('//') &&
                    !isStaticAsset(link.getAttribute('href'))) {

                    e.preventDefault();
                    const clientId = getAndEnsureClientId();
                    const href = link.getAttribute('href');
                    const fixedUrl = fixUrl(href, clientId);

                    if (clientId) {
                        window.location.href = fixedUrl;
                    }
                }
            });

            log('✅ Location methods interception enabled');
        } catch (err) {
            warn('Location interception failed:', err.message);
        }
    }

    // ==================== ПЕРЕХВАТ FETCH ====================
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        let url = typeof input === 'string' ? input : (input && input.url) || '';

        if (typeof url === 'string' && !url.startsWith('//') &&
            !url.startsWith('http://') && !url.startsWith('https://') &&
            !url.startsWith('/api/') && !isStaticAsset(url)) {

            const clientId = getAndEnsureClientId();
            const fixedUrl = fixUrl(url, clientId);
            if (clientId) {
            addClientIdToCurrentUrl(clientId);
            }
            // Если URL изменился - используем исправленный
            if (fixedUrl !== url && clientId) {
                log('Fetch intercepted:', url, '→', fixedUrl);

                let headers = {};
                if (init && init.headers) {
                    if (init.headers instanceof Headers) {
                        init.headers.forEach((value, key) => {
                            headers[key] = value;
                        });
                    } else {
                        headers = { ...init.headers };
                    }
                }

                // Добавляем CSRF и client_id
                const csrfToken = getCSRFToken();
                if (csrfToken && !headers['X-CSRFToken'] && !headers['x-csrftoken']) {
                    headers['X-CSRFToken'] = csrfToken;
                }

                // Уже добавили client_id в URL, но добавляем и в заголовки для надежности
                headers['x-tunnel-client-id'] = clientId;
                headers['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

                const newInit = {
                    ...init,
                    headers: headers,
                    credentials: 'include'
                };

                if (typeof input === 'string') {
                    return originalFetch.call(this, fixedUrl, newInit);
                } else if (input instanceof Request) {
                    const newRequest = new Request(fixedUrl, {
                        method: input.method,
                        headers: newInit.headers,
                        body: input.body,
                        credentials: 'include'
                    });
                    return originalFetch.call(this, newRequest);
                }
            }
        }
        return originalFetch.call(this, url, init);
  };

    // ==================== ПЕРЕХВАТ XMLHttpRequest ====================
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        if (typeof url === 'string' && CONFIG.enableXHRInterception) {
            const clientId = getAndEnsureClientId();
            const fixedUrl = fixUrl(url, clientId);

            if (fixedUrl !== url) {
                log('XHR intercepted:', url, '→', fixedUrl);
                url = fixedUrl;
            }
        }
        return originalXHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {

        if (CONFIG.enableXHRInterception) {
            const clientId = getAndEnsureClientId();
            if (clientId && !this._tunnelHeadersSet) {
                this.setRequestHeader('x-tunnel-client-id', clientId);
                const csrfToken = getCSRFToken();
                if (csrfToken) {
                    this.setRequestHeader('X-CSRFToken', csrfToken);
                }
                this._tunnelHeadersSet = true;
            }
        }
        return originalXHRSend.call(this, body);

    };

    // ==================== ПЕРЕХВАТ СОЗДАНИЯ ЭЛЕМЕНТОВ ====================
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName, options) {
        const element = originalCreateElement.call(this, tagName, options);

        if (tagName.toLowerCase() === 'a') {
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
                if (name === 'href' && typeof value === 'string' &&
                    value.startsWith('/') && !value.startsWith('//') &&
                    !isStaticAsset(value)) {

                    const clientId = getAndEnsureClientId();
                    const fixedValue = fixUrl(value, clientId);
                    if (fixedValue !== value) {
                        log('Dynamic link fix:', value, '→', fixedValue);
                        value = fixedValue;
                    }
                }
                return originalSetAttribute.call(this, name, value);
            };
        }

        if (tagName.toLowerCase() === 'form') {
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
                if (name === 'action' && typeof value === 'string' &&
                    value.startsWith('/') && !value.startsWith('//') &&
                    !isStaticAsset(value)) {

                    const clientId = getAndEnsureClientId();
                    const fixedValue = fixUrl(value, clientId);
                    if (fixedValue !== value) {
                        log('Dynamic form fix:', value, '→', fixedValue);
                        value = fixedValue;
                    }
                }
                return originalSetAttribute.call(this, name, value);
            };
        }

        return element;
    };

    // ==================== ПЕРЕХВАТ SETATTRIBUTE ====================
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if ((name === 'href' || name === 'action' || name === 'src' || name === 'data-href') &&
            typeof value === 'string' && value.startsWith('/') &&
            !value.startsWith('//') && !isStaticAsset(value)) {

            const clientId = getAndEnsureClientId();
            const fixedValue = fixUrl(value, clientId);
            if (fixedValue !== value) {
                log(`Attribute ${name} fix:`, value, '→', fixedValue);
                value = fixedValue;
            }
        }
        return originalSetAttribute.call(this, name, value);
    };

    // ==================== ОБРАБОТКА ССЫЛОК ====================
    function handleLinkClick(e) {
        if (!CONFIG.enableLinkInterception) return;

        const link = e.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href) return;

        // Пропускаем якоря и javascript
        if (href.startsWith('#') || href.startsWith('javascript:')) {
            return;
        }

        if (isStaticAsset(href)) {
            return;
        }

        // ОСОБАЯ ОБРАБОТКА ДЛЯ КОРНЕВОГО ПУТИ
        if (href === '/' || href === '') {
            // Для корневого пути не добавляем /tunnel/
            e.preventDefault();
            e.stopPropagation();

            const clientId = getAndEnsureClientId();
            if (!clientId) {
                alert('Please connect to tunnel first.');
                return;
            }

            // Просто перезагружаем страницу с client_id
            window.location.href = `/?client_id=${clientId}`;
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const clientId = getAndEnsureClientId();

        if (!clientId) {
            alert('Please connect to tunnel first.');
            return;
        }

        const fixedHref = fixUrl(href, clientId);
        log('Loading link:', href, '→', fixedHref);

        // Используем fetch для загрузки страницы
        fetch(fixedHref, {
            method: 'GET',
            headers: {
                'x-tunnel-client-id': clientId,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            credentials: 'include'
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
        })
        .then(html => {
            updatePageContent(html, fixedHref);
        })
        .catch(err => {
            console.error('Failed to load page:', err);
            alert('Error: ' + err.message);
        });
    }

    // ==================== ОБРАБОТКА ФОРМ ====================
    function handleFormSubmit(e) {
        if (!CONFIG.enableFormInterception) return;

        const form = e.target.closest('form');
        if (!form) return;

        e.preventDefault();
        e.stopPropagation();

        if (isProcessing) return;
        isProcessing = true;

        const action = form.getAttribute('action') || window.location.pathname;
        const method = (form.getAttribute('method') || 'GET').toUpperCase();
        const formData = new FormData(form);
        const clientId = getAndEnsureClientId();

        if (!clientId) {
            alert('Please connect to tunnel first.');
            isProcessing = false;
            return;
        }

        log('Submitting form:', method, action);

        // ОСОБАЯ ОБРАБОТКА ДЛЯ GET ФОРМ
        if (method === 'GET') {
            // Для GET форм просто перенаправляем на исправленный URL с параметрами
            const params = new URLSearchParams();
            for (const [key, value] of formData) {
                params.append(key, value);
            }

            let queryString = params.toString();
            let url = action;
            if (queryString) {
                url += (url.includes('?') ? '&' : '?') + queryString;
            }

            const fixedUrl = fixUrl(url, clientId);
            log('GET form redirect:', url, '→', fixedUrl);

            // Используем fetch для загрузки
            fetch(fixedUrl, {
                method: 'GET',
                headers: {
                    'x-tunnel-client-id': clientId,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                credentials: 'include'
            })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(html => {
                updatePageContent(html, fixedUrl);
            })
            .catch(err => {
                console.error('Form submission failed:', err);
                alert('Form submission failed: ' + err.message);
            })
            .finally(() => {
                isProcessing = false;
            });

            return;
        }

        // Обработка POST, PUT, PATCH форм
        const fixedAction = fixUrl(action, clientId);
        const isMultipart = form.enctype === 'multipart/form-data';

        const requestOptions = {
            method: method,
            headers: {
                'x-tunnel-client-id': clientId,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            credentials: 'include'
        };

        // Добавляем CSRF токен если его нет в форме
        const csrfInput = form.querySelector('input[name="csrfmiddlewaretoken"]');
        if (!csrfInput) {
            const csrfToken = getCSRFToken();
            if (csrfToken) {
                formData.append('csrfmiddlewaretoken', csrfToken);
                log('Added CSRF token to form submission');
            }
        }

        if (isMultipart) {
            requestOptions.body = formData;
            log('📎 Multipart form data detected');
        } else {
            requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            const urlEncodedData = new URLSearchParams();
            for (const [key, value] of formData) {
                urlEncodedData.append(key, value);
            }
            requestOptions.body = urlEncodedData.toString();
        }

        // Добавляем CSRF в заголовки
        const csrfToken = getCSRFToken();
        if (csrfToken) {
            requestOptions.headers['X-CSRFToken'] = csrfToken;
        }

        fetch(fixedAction, requestOptions)
            .then(response => {
                if ([301, 302, 303, 307, 308].includes(response.status)) {
                const location = response.headers.get('Location') || response.headers.get('location');
                if (location) {
                    const fixedLocation = fixUrl(location, clientId);
                    window.location.href = fixedLocation;
                    return response.text();
                }
              }
              if (response.status === 403) {
                 throw new Error('CSRF verification failed. Please refresh the page and try again.');
                 throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                  }
                return response.text();
            })
            .then(html => {
                updatePageContent(html, fixedAction);
            })
            .catch(err => {
                console.error('Form submission failed:', err);
                alert('Form submission failed: ' + err.message);
            })
            .finally(() => {
                isProcessing = false;
            });
    }

    // ==================== ОБНОВЛЕНИЕ СТРАНИЦЫ ====================
    function updatePageContent(html, sourceUrl) {
        log('Updating page from:', sourceUrl);

        // Удаляем debug toolbar Django если есть
        html = html.replace(/<div[^>]*id="djDebug"[^>]*>[\s\S]*?<\/div>/gi, '');

        const contentArea = document.getElementById('content') ||
                           document.querySelector('.content-area') ||
                           document.body;

        if (!contentArea) {
            console.error('No content area found');
            return;
        }

        try {
            // Создаем временный контейнер
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            // Фиксируем URL в новом контенте с client_id
            const clientId = getAndEnsureClientId();
            fixAllUrlsInElement(tempDiv, clientId);

            // Заменяем содержимое
            if (contentArea.id === 'content') {
                contentArea.innerHTML = '';
                contentArea.appendChild(tempDiv);
            } else {
                document.body.innerHTML = tempDiv.innerHTML;
            }

            // Обновляем историю с client_id
            try {
                const urlObj = new URL(sourceUrl, window.location.origin);
                urlObj.searchParams.set('client_id', clientId);
                window.history.pushState({ path: sourceUrl, clientId: clientId }, '', urlObj.toString());
            } catch (err) {
                // Игнорируем ошибки истории
            }
            setTimeout(() => {
              if (typeof window.setupTunnelInterceptors === 'function') {
                window.setupTunnelInterceptors();
              } else {
                console.warn('setupTunnelInterceptors not available');
              }
            }, 100);

            log('Page updated successfully');

        } catch (err) {
            console.error('Error updating page content:', err);
            if (contentArea) {
                contentArea.innerHTML = `
                    <div style="padding: 50px; text-align: center; color: #dc3545;">
                        <h2>Error displaying content</h2>
                        <p>${err.message}</p>
                    </div>
                `;
            }
        }
    }

    function fixAllUrlsInElement(element, clientId = null) {
        if (!element || !element.querySelectorAll) return;

        const attributes = ['href', 'src', 'action', 'data-src', 'data-url', 'formaction', 'data-href'];
        const excludePatterns = [
        '/static/vendors/',
        '/static/js/',
        'bootstrap',
        'jquery',
        'popper'
         ];
        const submitButtons = element.querySelectorAll('button[type="submit"]');
        submitButtons.forEach(button => {
            if (!button.closest('form')) {
                // Обернуть в форму или добавить обработчик
                button.addEventListener('click', function(e) {
                    e.preventDefault();
                    const clientId = getAndEnsureClientId();
                    if (!clientId) return;

                    // Найти куда submit
                    const action = button.getAttribute('formaction') ||
                                  window.location.pathname;
                    const fixedAction = fixUrl(action, clientId);

                    // Отправить запрос
                    fetch(fixedAction, {
                        method: 'POST',
                        headers: {
                            'x-tunnel-client-id': clientId,
                            'X-CSRFToken': getCSRFToken()
                        },
                        credentials: 'include'
                    }).then(response => {
                        if (response.ok) {
                            window.location.reload();
                        }
                    });
                });
            }
        });
        // 1. Фиксируем атрибуты
        attributes.forEach(attr => {
            const elements = element.querySelectorAll(`[${attr}]`);
            elements.forEach(el => {
                const value = el.getAttribute(attr);
                if (value) {
                    if (excludePatterns.some(pattern => value.includes(pattern))) return;
                    const fixed = fixUrl(value, clientId);
                    if (fixed !== value) {
                        el.setAttribute(attr, fixed);
                        log(`Fixed ${attr}: ${value} → ${fixed}`);
                    }
                }
            });
        });

        // 2. Фиксируем формы с method="GET"
        const forms = element.querySelectorAll('form[method="GET"], form:not([method])');
        forms.forEach(form => {
            const action = form.getAttribute('action');
            if (action) {
                const fixed = fixUrl(action, clientId);
                if (fixed !== action) {
                    form.setAttribute('action', fixed);
                    log(`Fixed form action: ${action} → ${fixed}`);
                }
            }
        });

        // 3. Фиксируем inline стили
        const elementsWithStyle = element.querySelectorAll('[style]');
        elementsWithStyle.forEach(el => {
            const style = el.getAttribute('style');
            if (style && style.includes('url(/')) {
                const fixedStyle = style.replace(
                    /url\(["']?(\/(?!\/))([^"')]*)["']?\)/g,
                    (match, slash, path) => {
                        return `url("${fixUrl('/' + path, clientId)}")`;
                    }
                );
                el.setAttribute('style', fixedStyle);
            }
        });

        // 4. Фиксируем теги style
        const styleTags = element.querySelectorAll('style');
        styleTags.forEach(style => {
            style.textContent = style.textContent.replace(
                /url\(["']?(\/(?!\/))([^"')]*)["']?\)/g,
                (match, slash, path) => {
                    return `url("${fixUrl('/' + path, clientId)}")`;
                }
            );
        });
    }

    // ==================== BOOTSTRAP КОМПОНЕНТЫ ====================
    function initializeBootstrapComponents(force=false) {
        if (bootstrapInitialized && !force) return;
        log('🔄 Initializing Bootstrap components...');
        const clientId = getAndEnsureClientId();
        if (!clientId) return;
        addClientIdToCurrentUrl(clientId);
        // 1. Dropdowns
        const dropdowns = document.querySelectorAll('.dropdown-toggle:not([data-tunnel-initialized])');        console.log(`Found ${dropdowns.length} dropdowns on page`);

        if (dropdowns.length === 0) {
            console.log('⚠️ No dropdowns found on current page');
            return;
        }
        dropdowns.forEach(dropdown => {
            if (!dropdown.hasAttribute('data-tunnel-initialized')) {
                dropdown.setAttribute('data-tunnel-initialized', 'true');

                dropdown.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();

                    const parent = this.closest('.dropdown');
                    if (!parent) return;

                    const menu = parent.querySelector('.dropdown-menu');
                    if (!menu) return;

                    const isExpanded = this.getAttribute('aria-expanded') === 'true';
                    // Toggle текущего
                    menu.classList.toggle('show');
                    this.setAttribute('aria-expanded', (!isExpanded).toString());
                    // Закрываем другие dropdowns
                    if (!isExpanded) {
                    document.querySelectorAll('.dropdown-menu.show').forEach(m => {
                        if (m !== menu) m.classList.remove('show');
                    });
                    document.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach(t => {
                        t.setAttribute('aria-expanded', 'false');
                    });
                    }

                    log(`Dropdown toggled: ${this.textContent}`);
                });
            }
        });

        // 2. Navbar toggler
        const navbarTogglers = document.querySelectorAll('.navbar-toggler');
        navbarTogglers.forEach(toggler => {
            if (!toggler.hasAttribute('data-tunnel-initialized')) {
                toggler.setAttribute('data-tunnel-initialized', 'true');

                toggler.addEventListener('click', function() {
                    const target = this.getAttribute('data-bs-target') || this.getAttribute('data-target');
                    if (target) {
                        const targetEl = document.querySelector(target);
                        if (targetEl) {
                            const isCollapsed = this.classList.contains('collapsed');

                            if (isCollapsed) {
                                targetEl.classList.add('show');
                                this.classList.remove('collapsed');
                                this.setAttribute('aria-expanded', 'true');
                            } else {
                                targetEl.classList.remove('show');
                                this.classList.add('collapsed');
                                this.setAttribute('aria-expanded', 'false');
                            }
                        }
                    }
                });
            }
        });

        // 3. Закрытие dropdown при клике вне
        if (!document.body.hasAttribute('data-dropdown-close-bound')) {
            document.body.setAttribute('data-dropdown-close-bound', 'true');

            document.addEventListener('click', function(e) {
                if (!e.target.closest('.dropdown')) {
                    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                        menu.classList.remove('show');
                    });
                    document.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach(toggle => {
                        toggle.setAttribute('aria-expanded', 'false');
                    });
                }
            });
        }
        bootstrapInitialized = true;
        log('✅ Bootstrap components initialized');
    }

    // ==================== БРАУЗЕР КЛИЕНТ ====================
    class TunnelBrowserClient {
        constructor() {
            this.clientId = null;
            this.isConnected = false;
            this.serverUrl = window.location.origin;

            this.bindEvents();
            this.updateUI();
            this.restoreClientId();
            this.checkExistingSession();
        }

        bindEvents() {
            const connectBtn = document.getElementById('connectBtn');
            const disconnectBtn = document.getElementById('disconnectBtn');
            const loadHomeBtn = document.getElementById('loadHomeBtn');
            const openDirectBtn = document.getElementById('openDirectBtn');

            if (connectBtn) {
                connectBtn.addEventListener('click', () => this.connect());
            }
            if (disconnectBtn) {
                disconnectBtn.addEventListener('click', () => this.disconnect());
            }
            if (loadHomeBtn) {
                loadHomeBtn.addEventListener('click', () => this.loadHomePage());
            }
            if (openDirectBtn) {
                openDirectBtn.addEventListener('click', () => this.openDirectLink());
            }
        }

        updateUI() {
            const statusIndicator = document.getElementById('statusIndicator');
            const statusText = document.getElementById('statusText');
            const clientIdElement = document.getElementById('clientId');
            const tunnelClientIdElement = document.getElementById('tunnelClientId');
            const connectBtn = document.getElementById('connectBtn');
            const disconnectBtn = document.getElementById('disconnectBtn');
            const loadHomeBtn = document.getElementById('loadHomeBtn');

            if (statusIndicator) {
                statusIndicator.className = 'status-indicator ' +
                    (this.isConnected ? 'status-connected' : 'status-disconnected');
            }

            if (statusText) {
                statusText.textContent = this.isConnected ? 'Connected' : 'Disconnected';
            }

            if (clientIdElement) {
                clientIdElement.textContent = this.clientId ?
                    `Client: ${this.clientId.substring(0, 15)}...` : 'No client ID';
            }

            if (tunnelClientIdElement) {
                tunnelClientIdElement.textContent = this.clientId || 'Not connected';
            }

            if (connectBtn) connectBtn.disabled = this.isConnected;
            if (disconnectBtn) disconnectBtn.disabled = !this.isConnected;
            if (loadHomeBtn) loadHomeBtn.disabled = !this.isConnected;
        }

        restoreClientId() {
            const savedClientId = getAndEnsureClientId();
            if (savedClientId) {
                this.clientId = savedClientId;
                this.isConnected = true;
                this.updateUI();
                log('Restored client ID:', savedClientId);
            }
        }

        async checkExistingSession() {
            try {
                log('Checking for existing session...');

                const response = await fetch('/api/restore-session', {
                    method: 'GET',
                    credentials: 'include'
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.clientId) {
                        this.clientId = data.clientId;
                        this.isConnected = true;
                        saveClientId(this.clientId);
                        this.updateUI();
                        log('✅ Restored session:', this.clientId);

                        // Автоматически загружаем главную страницу если контент пустой
                        const contentArea = document.getElementById('content');
                        if (contentArea && contentArea.innerHTML.includes('Welcome to gRPC Tunnel')) {
                            setTimeout(() => this.loadHomePage(), 500);
                        }

                        return true;
                    }
                }

                log('No existing session found');
                return false;

            } catch (err) {
                warn('Session check failed:', err.message);
                return false;
            }
        }

        async connect() {
            if (this.isConnected) return;

            log('Connecting to tunnel server...');

            try {
                const response = await fetch('/api/register-browser', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });

                if (!response.ok) {
                    if (response.status === 504) {
                        throw new Error('Server timeout - check if server is running');
                    }
                    throw new Error(`Registration failed: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();

                if (data.success) {
                    this.clientId = data.clientId;
                    this.isConnected = true;
                    saveClientId(this.clientId);

                    log('✅ Connected! Client ID:', this.clientId);
                    this.updateUI();

                    // Автоматически загружаем главную страницу
                    setTimeout(() => this.loadHomePage(), 500);
                    return true;
                } else {
                    throw new Error(data.message || 'Registration failed');
                }

            } catch (err) {
                console.error('Connection failed:', err.message);
                this.updateUI();
                alert('Connection failed: ' + err.message);
                return false;
            }
        }

async loadHomePage() {
    if (!this.isConnected || !this.clientId) {
        log('Not connected');
        return;
    }

    log('Loading home page...');

    // Загружаем корневую страницу БЕЗ /tunnel/
    const url = `/?client_id=${this.clientId}&redirect=false`; // Добавляем параметр чтобы избежать редиректа

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'x-tunnel-client-id': this.clientId
            },
            credentials: 'include'
        });

        if (response.ok) {
            const html = await response.text();
            const contentArea = document.getElementById('content') || document.body;
            contentArea.innerHTML = html;
            window.history.pushState({}, '', url);
            initializeBootstrapComponents(true);
            log('Home page loaded');
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (err) {
        console.error('Failed to load home page:', err);
        // Если ошибка 500, попробуем загрузить напрямую через /tunnel/
        if (err.message.includes('500')) {
            this.loadDirectTunnel();
        }
    }
}

async loadDirectTunnel() {
    log('Trying direct tunnel load...');
    const url = `/tunnel/?client_id=${this.clientId}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-tunnel-client-id': this.clientId,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            credentials: 'include'
        });

        if (response.ok) {
            const html = await response.text();
            const contentArea = document.getElementById('content') || document.body;
            contentArea.innerHTML = html;
            window.history.pushState({}, '', url);
            log('Direct tunnel loaded');
        }
    } catch (err) {
        console.error('Direct tunnel also failed:', err);
    }
}

        async loadUrl(path) {
            if (!this.isConnected || !this.clientId) {
                log('Not connected');
                return;
            }

            log('Loading:', path);

            try {
                const fixedUrl = fixUrl(path, this.clientId);
                const response = await fetch(fixedUrl, {
                    method: 'GET',
                    headers: {
                        'x-tunnel-client-id': this.clientId,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    credentials: 'include'
                });

                if (response.ok) {
                    const html = await response.text();
                    updatePageContent(html, path);
                    log('Content loaded successfully');
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (err) {
                console.error('Failed to load page:', err.message);
            }
        }

        openDirectLink() {
            const clientId = getAndEnsureClientId();
            let url = `${this.serverUrl}/tunnel/`;

            if (clientId) {
                url += `?client_id=${clientId}`;
            }

            window.open(url, '_blank');
            log('Opened direct link:', url);
        }

        disconnect() {
            this.isConnected = false;
            this.clientId = null;
            globalClientId = null;

            localStorage.removeItem('tunnel_client_id');
            document.cookie = 'tunnel_client_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

            this.updateUI();
            log('Disconnected');
        }
    }

    // ==================== УНИВЕРСАЛЬНАЯ ФУНКЦИЯ ДЛЯ ВСЕХ СТРАНИЦ ====================
    function setupTunnelInterceptors() {
        log('🔄 Setting up tunnel interceptors for current page...');

        // 1. Фиксируем все URL на текущей странице
        const clientId = getAndEnsureClientId();
        fixAllUrlsInElement(document, clientId);

        // 2. Настраиваем глобальные обработчики событий
        setupGlobalEventListeners();

        // 3. Инициализируем Bootstrap компоненты
        //initializeBootstrapComponents();

        // 4. Устанавливаем Mutation Observer
        startMutationObserver();

        log('✅ Tunnel interceptors setup complete');
    }

    // ==================== MUTATION OBSERVER ====================
    function startMutationObserver() {
        if (!CONFIG.enableMutationObserver) return;

        if (mutationObserver) {
            mutationObserver.disconnect();
        }

        let timeoutId = null;

        mutationObserver = new MutationObserver((mutations) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            timeoutId = setTimeout(() => {
                const clientId = getAndEnsureClientId();
                let hasChanges = false;

                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1) {
                                fixAllUrlsInElement(node, clientId);
                                hasChanges = true;
                            }
                        });
                    }
                });

                if (hasChanges) {
                    // Инициализируем Bootstrap компоненты
                    setupAjaxDomObserver();
                    }

                timeoutId = null;
            }, 300);
        });

        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });

        log('MutationObserver started');
    }

    // ==================== ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ ====================
    function setupGlobalEventListeners() {
        // Обрабатываем ВСЕ клики на ссылках
        document.addEventListener('click', function(e) {
            if (!CONFIG.enableLinkInterception) return;

            const link = e.target.closest('a[href]');
            if (link) {
                const href = link.getAttribute('href');
                if (href && href.startsWith('/') && !href.startsWith('//') && !isStaticAsset(href)) {
                    handleLinkClick(e);
                }
            }
        });

        // Обрабатываем ВСЕ формы
        document.addEventListener('submit', function(e) {
            if (!CONFIG.enableFormInterception) return;

            const form = e.target.closest('form');
            if (form) {
                const action = form.getAttribute('action');
                if (action && action.startsWith('/') && !action.startsWith('//')) {
                    handleFormSubmit(e);
                }
            }
        });

        // Обрабатываем history API
        window.addEventListener('popstate', (event) => {
            if (event.state && event.state.path && tunnelClient) {
                tunnelClient.loadUrl(event.state.path);
            }
        });

        // Обрабатываем видимость страницы
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Перепроверяем client_id при возвращении на вкладку
                getAndEnsureClientId();
            }
        });

        // Обрабатываем beforeunload
        window.addEventListener('beforeunload', () => {
            // Сохраняем состояние
            if (globalClientId) {
                localStorage.setItem('tunnel_client_id', globalClientId);
            }
        });
    }

    // ==================== ОБРАБОТКА ДИНАМИЧЕСКИХ ССЫЛОК ====================
    function setupDynamicLinkHandler() {
        // Используем делегирование событий для динамически добавленных ссылок
        document.addEventListener('mousedown', function(e) {
            const link = e.target.closest('a[href]');
            if (link && link.getAttribute('href') &&
                link.getAttribute('href').startsWith('/') &&
                !isStaticAsset(link.getAttribute('href'))) {

                const clientId = getAndEnsureClientId();
                const href = link.getAttribute('href');
                const fixedHref = fixUrl(href, clientId);

                if (fixedHref !== href) {
                    link.setAttribute('href', fixedHref);
                    log('Dynamic link fixed on mousedown:', href, '→', fixedHref);
                }
            }
        }, true); // Используем capture phase
    }

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    function initialize() {
        log(`🚀 Initializing gRPC Tunnel Frontend v${FRONTEND_VERSION}...`);

        // Общие инициализации для всех страниц
        interceptLocationChanges();
        getAndEnsureClientId(); // Получаем или создаем client_id

        // Для корневой страницы с элементами управления
        if (isRootPage()) {
            tunnelClient = new TunnelBrowserClient();
            window.tunnelClient = tunnelClient;

            // Запускаем базовые перехватчики
            setupTunnelInterceptors();
            setupDynamicLinkHandler();

            // Проверяем и восстанавливаем сессию
            setTimeout(() => {
                if (!tunnelClient.isConnected) {
                    tunnelClient.checkExistingSession();
                }
            }, 1000);

        } else {
            // Для страниц, загруженных через туннель
            // Создаем минимального клиента только для хранения client_id
            const clientId = getAndEnsureClientId();
            tunnelClient = {
                clientId: clientId,
                isConnected: !!clientId,
                loadUrl: async function(path) {
                    const currentClientId = getAndEnsureClientId();
                    const fixedUrl = fixUrl(path, currentClientId);
                    window.location.href = fixedUrl;
                }
            };
            window.tunnelClient = tunnelClient;

            // Запускаем полные перехватчики
            setupTunnelInterceptors();
            setupDynamicLinkHandler();

            // Фиксируем все ссылки на странице
            setTimeout(() => {
                const currentClientId = getAndEnsureClientId();
                fixAllUrlsInElement(document, currentClientId);
            }, 500);
        }

        // Экспортируем API для отладки
        window.tunnelAPI = {
            version: FRONTEND_VERSION,
            getClientId: getAndEnsureClientId,
            saveClientId: saveClientId,
            fixUrl: (url) => fixUrl(url, getAndEnsureClientId()),
            reload: () => window.location.reload(),
            debug: CONFIG.debug,
            client: tunnelClient,
            config: CONFIG,
            restart: () => {
                if (mutationObserver) {
                    mutationObserver.disconnect();
                    mutationObserver = null;
                }
                setTimeout(initialize, 100);
            },
            setupInterceptors: setupTunnelInterceptors
        };

        log('✅ gRPC Tunnel Frontend initialized');
        log('📊 Config:', CONFIG);
        log('👤 Client ID:', getAndEnsureClientId());

        // Автоматическая проверка через 2 секунды для отлова любых пропущенных элементов
        setTimeout(() => {
            const clientId = getAndEnsureClientId();
            if (clientId) {
                log('Final URL fix check...');
                fixAllUrlsInElement(document, clientId);
            }
        }, 2000);
    }

    // ==================== ФИНАЛЬНАЯ ИНИЦИАЛИЗАЦИЯ ====================

    // Основная функция запуска
    function main() {
        // Всегда запускаем базовые перехватчики
        initialize();
    }

    // ==================== ЗАПУСК ====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(main, 100);
        });
    } else {
        setTimeout(main, 100);
    }

    // Экспортируем setupTunnelInterceptors для вызова из загруженных страниц
    window.setupTunnelInterceptors = setupTunnelInterceptors;

})();
