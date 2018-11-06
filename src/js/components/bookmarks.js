// import '../img/broken-image.svg';
import Sortable from 'sortablejs';
import FS from './fs';
import Helpers from './helpers';

/**
 * Bookmarks module
 */
const Bookmarks = (() => {
  const bk = chrome.bookmarks;
  const SVGLoading = `
    <svg class="loading" viewBox= "0 0 100 100" xmlns= "http://www.w3.org/2000/svg" >
      <circle class="path" fill="none" stroke-width="8" stroke-linecap="round" cx="50" cy="50" r="40"></circle>
    </svg>
  `;

  const container = document.getElementById('bookmarks');
  let sort = null;

  function init() {
    if (!container) return;

    if (!localStorage.getItem('custom_dials')) {
      localStorage.setItem('custom_dials', '{}');
    }

    FS.init(500);
    FS.usedAndRemaining(function(used) {
      if (used === 0) {
        localStorage.setItem('custom_dials', '{}');
        localStorage.setItem('background_local', '');
      }
    });

    // Vertical center
    if (localStorage.getItem('vertical_center') === 'true') {
      container.classList.add('grid--vcenter');
    }

    // TODO: experiment low transparency thumbs
    if (localStorage.getItem('low_transparency') === 'true') {
      container.classList.add('low-transparency');
    }

    // Create speeddial
    createSpeedDial(startFolder());

    // Hide the settings icon if setting_icon disable
    if (localStorage.getItem('show_settings_icon') === 'false') {
      const icon = document.getElementById('settings_icon');
      icon.parentNode.removeChild(icon);
    }

    // Search bookmarks if toolbar enable
    let select;
    if (localStorage.getItem('show_toolbar') === 'false') {
      document.getElementById('header').remove();
      document.getElementById('main').classList.add('hidden-toolbar');
    } else {
      const searchReset = document.getElementById('searchReset');
      select = document.getElementById('selectFolder');
      generateFolderList(select);
      select.addEventListener('change', changeFolder, false);

      const searchDebounce = Helpers.debounce(function(evt) {
        const value = evt.target.value;

        (value.length > 0)
          ? searchReset.classList.add('show')
          : searchReset.classList.remove('show');

        search(evt);
      }, 500);
      const fieldEl = document.getElementById('bookmarkSearch');
      fieldEl.addEventListener('input', searchDebounce, false);
      // Form input reset handler
      searchReset.addEventListener('click', function() {
        fieldEl.value = '';
        // Helpers.trigger('input', fieldEl);
        createSpeedDial(startFolder());
        fieldEl.focus();
        searchReset.classList.remove('show');

        if (localStorage.getItem('drag_and_drop') === 'true') {
          sort.option('disabled', false);
        }
      }, false);
    }

    // Change the current dial if the page hash changes
    window.addEventListener('hashchange', function() {
      createSpeedDial(startFolder());

      const id = window.location.hash.slice(1);
      if (localStorage.getItem('show_toolbar') === 'true' && select) {
        const option = select.querySelector(`#selectFolder [value="${id}"]`);
        if (!option) return;
        option.selected = true;
      }
      Helpers.customTrigger('changeFolder', container, {
        detail: {
          id: id
        }
      });
    }, false);

    container.addEventListener('updateFolderList', function(e) {
      if (!select) return;
      if (e.detail && e.detail.isFolder) {
        generateFolderList(select);
      }
    });

    // Dragging option
    if (localStorage.getItem('drag_and_drop') === 'true') {
      sort = Sortable.create(container, {
        animation: 200,
        filter: '.bookmark__action',
        draggable: '.bookmark',
        ghostClass: 'bookmark--ghost',
        chosenClass: 'bookmark--chosen',
        preventOnFilter: false,
        onMove(evt) {
          // do not sort create column
          if (evt.related.classList.contains('bookmark--nosort')) {
            return false;
          }
        },
        onUpdate() {
          Array.prototype.slice.call(container.querySelectorAll('.bookmark')).forEach(function(item, index) {
            bk.move(item.getAttribute('data-sort'), {
              'parentId': container.getAttribute('data-folder'),
              'index': index
            });
          });
        }
      });
    }

  }

  function startFolder() {
    let folderId = localStorage.getItem('default_folder_id');
    if (window.location.hash !== '') {
      folderId = window.location.hash.slice(1);
    }
    return folderId;
  }

  function generateFolderList(select) {
    // If not select element
    if (!(select instanceof HTMLSelectElement)) return;

    bk.getTree(function(rootNode) {
      let folderList = [], openList = [], node, child;
      // Never more than 2 root nodes, push both Bookmarks Bar & Other Bookmarks into array
      // openList.push(rootNode[0].children[0]);
      // openList.push(rootNode[0].children[1]);
      // root folders
      openList = rootNode[0].children.map(item => {
        return item;
      });

      while ((node = openList.pop()) !== undefined) {
        if (node.children !== undefined) {
          if (node.parentId === '0') {
            node.path = ''; // Root elements have no parent so we shouldn't show their path
          }
          node.path += node.title;
          while ((child = node.children.pop()) !== undefined) {
            if (child.children !== undefined) {
              child.path = node.path + '/';
              openList.push(child);
            }
          }
          folderList.push(node);
        }
      }
      folderList.sort(function(a, b) {
        return a.path.localeCompare(b.path);
      });

      let optionsList = folderList.map(function(item) {
        return `<option${item.id === startFolder() ? ' selected' : ''} value="${item.id}">${item.path}</option>`;
      }).join('');
      select.innerHTML = optionsList;
    });
  }

  function genBookmark(bookmark) {

    const hasFavicon = (localStorage.getItem('show_favicon') === 'true')
      ? '<img class="bookmark__favicon" width="16" height="16" src="chrome://favicon/%url%" alt="">'
      : '';

    const screen = getCustomDial(bookmark.id);
    const thumbContainer = (screen)
      ?
      `<div class="bookmark__img" style="background-image: url('${screen}');"></div>`
      :
      `<div class="bookmark__img bookmark__img--external"
            data-fail-thumb="/img/broken-image.svg"
            data-external-thumb="%thumbnailing_service%">
      </div>`;

    const tpl =
      `
        <div class="bookmark"
          data-sort="%id%"
          data-props='{"isFolder":false,"title":"%title%","url":"%url%","id":"%id%","screen":"%screen%"}'>
          <div class="bookmark__wrap">
            <button class="bookmark__action"></button>
            ${thumbContainer}
            <div class="bookmark__caption">
              ${hasFavicon}
              <div class="bookmark__title">%title%</div>
            </div>
          </div>
          <a class="bookmark__link" href="%url%" title="%title%"></a>
        </div>
      `;

    return Helpers.templater(tpl, {
      id: bookmark.id,
      url: bookmark.url,
      site: Helpers.getDomain(bookmark.url),
      screen: screen,
      // localStorage.getItem('thumbnailing_service').replace('[URL]', encodeURIComponent(bookmark.url)),
      // eslint-disable-next-line max-len
      thumbnailing_service: localStorage.getItem('thumbnailing_service').replace('[URL]', Helpers.getDomain(bookmark.url)),
      title: Helpers.escapeHtml(bookmark.title)
    });
  }

  function genFolder(bookmark) {
    let imgLayout;
    const screen = getCustomDial(bookmark.id);

    if (screen) {
      imgLayout = `<div class="bookmark__img bookmark__img--contain" style="background-image: url(${screen})"></div>`;
    } else {
      imgLayout = '<div class="bookmark__img bookmark__img--folder"></div>';
    }

    const tpl =
      `
        <div class="bookmark"
          data-sort="%id%"
          data-props='{"isFolder":true,"title":"%title%","id":"%id%","screen":"%screen%"}'>
          <div class="bookmark__wrap">
            <button class="bookmark__action"></button>
            ${imgLayout}
            <div class="bookmark__caption">
              <img src="/img/folder.svg" class="bookmark__favicon" width="16" height="16" alt="">
              <div class="bookmark__title">%title%</div>
            </div>
          </div>
          <a class="bookmark__link" href="#%url%" title="%title%"></a>
        </div>
      `;
    return Helpers.templater(tpl, {
      id: bookmark.id,
      url: bookmark.id,
      title: Helpers.escapeHtml(bookmark.title),
      screen: screen
    });
  }

  function render(_array, isCreate = false) {
    let arr = _array.map(function(bookmark) {
      if (bookmark.url !== undefined) {
        return genBookmark(bookmark);
      }
      if (bookmark.children !== undefined) {
        return genFolder(bookmark);
      }
    });

    container.innerHTML =
      `${arr.join('')}
      ${isCreate
    ?
    `
      <div class="bookmark--create bookmark--nosort md-ripple">
        <div class="bookmark__img--add"></div>
        <a class="bookmark__link--create" id="add" data-create="New"></a>
      </div>
    `
    : ''
  }
    `;

    // loaded external images
    const thumbs = container.querySelectorAll('.bookmark__img--external');
    for (let img of thumbs) {
      Helpers.imageLoaded(img.dataset.externalThumb, {
        done(data) {
          img.style.backgroundImage = `url(${data})`;
        },
        fail() {
          img.classList.remove('bookmark__img--external');
          img.classList.add('bookmark__img--broken');
          img.style.backgroundImage = `url(${img.dataset.failThumb})`;
        }
      });
    }
  }

  function getCustomDial(id) {
    const storage = JSON.parse(localStorage.getItem('custom_dials'));
    let image;
    if (storage) {
      image = storage[id];
    }
    return image;
  }

  function createSpeedDial(id) {

    const hasCreate = (localStorage.getItem('show_create_column') === 'true');

    bk.getSubTree(id, function(item) {
      // if the folder by id exists
      if (item !== undefined && item[0] !== undefined && item[0].children !== undefined) {
        if (!container.classList.contains('grid')) {
          container.classList.add('grid');
        }
        render(item[0].children, hasCreate);
        container.setAttribute('data-folder', id);
      } else {
        Helpers.notifications(chrome.i18n.getMessage('notice_cant_find_id'));
        // remove grid class
        container.classList.remove('grid');
        container.innerHTML = `
          <div class="not-found">
            <div class="not-found__wrap">
              <div class="not-found__icon"></div>
              <div class="not-found__text">
                ${chrome.i18n.getMessage('not_found_text')}
              </div>
              <a class="btn md-ripple" href="#1">${chrome.i18n.getMessage('not_found_link_text')}</a>
            </div>
          </div>
        `;
      }
    });
  }

  function uploadScreen(data) {
    const { target, id, site } = data;
    const file = target.files[0];
    if (!file) return;

    if (!/image\/(jpe?g|png)$/.test(file.type)) {
      return alert(chrome.i18n.getMessage('alert_file_type_fail'));
    }
    target.value = '';

    const bookmark = document.querySelector(`[data-sort="${id}"]`);
    bookmark.innerHTML += `<div class="bookmark__overlay">${SVGLoading}</div>`;

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = function() {

      Helpers.resizeScreen(reader.result, function(image) {
        const blob = Helpers.base64ToBlob(image, 'image/jpg');

        let name;
        if (site) {
          name = `${site}_${id}.jpg`;
        } else {
          name = `folder-${id}.jpg`;
        }

        FS.createDir('images', function() {
          FS.createFile(`/images/${name}`, { file: blob, fileType: 'jpg' }, function(fileEntry) {

            const obj = JSON.parse(localStorage.getItem('custom_dials'));
            obj[id] = fileEntry.toURL();
            localStorage.setItem('custom_dials', JSON.stringify(obj));

            const imgEl = bookmark.querySelector('.bookmark__img');
            const props = JSON.parse(bookmark.dataset.props);
            props.screen = fileEntry.toURL();

            if (data.site) {
              imgEl.classList.remove('bookmark__img--external', 'bookmark__img--broken');
            } else {
              imgEl.classList.remove('bookmark__img--folder');
              imgEl.classList.add('bookmark__img--contain');
            }

            bookmark.dataset.props = JSON.stringify(props);
            imgEl.style.backgroundImage = `url('${fileEntry.toURL()}?refresh=${Date.now()}')`;

            let overlay = bookmark.querySelector('.bookmark__overlay');
            if (overlay) {
              overlay.remove();
            }
            Helpers.notifications(
              chrome.i18n.getMessage('notice_thumb_image_updated')
            );

          });
        });

      });

    };

    reader.onerror = function() {
      console.warn('Image upload failed');
    };

  }

  function createScreen(bookmark, idBookmark, captureUrl) {
    bookmark.classList.add('disable-events');
    bookmark.innerHTML += `<div class="bookmark__overlay">${SVGLoading}</div>`;

    const image = bookmark.querySelector('.bookmark__img');

    chrome.runtime.sendMessage({ captureUrl: captureUrl, id: idBookmark }, (response) => {

      let overlay = bookmark.querySelector('.bookmark__overlay');

      if (response.warning) {
        console.warn(response.warning);
        if (overlay) {
          overlay.remove();
          bookmark.classList.remove('disable-events');
        }
        return false;
      }

      image.classList.remove('bookmark__img--external', 'bookmark__img--broken');
      image.style.backgroundImage = `url('${response}?refresh=${Date.now()}')`;
      bookmark.classList.remove('disable-events');
      if (overlay) {
        overlay.remove();
      }
    });
  }

  function search(evt) {
    const value = evt.target.value.trim().toLowerCase();
    const isdnd = localStorage.getItem('drag_and_drop') === 'true';
    bk.search(value, function(match) {
      if (match.length > 0) {
        if (isdnd) {
          sort.option('disabled', true);
        }
        render(match);
      } else {
        if (isdnd) {
          sort.option('disabled', false);
        }
        createSpeedDial(startFolder());
      }
    });
  }

  function changeFolder() {
    const id = this.value;
    window.location.hash = `#${id}`;
  }

  function removeBookmark(bookmark) {
    if (confirm(chrome.i18n.getMessage('confirm_delete_bookmark'), '')) {
      const id = bookmark.getAttribute('data-sort');
      bk.remove(id, function() {
        bookmark.remove();
        rmCustomScreen(id);
        Helpers.notifications(
          chrome.i18n.getMessage('notice_bookmark_removed')
        );
      });
    }
  }

  function removeFolder(bookmark) {
    if (confirm(chrome.i18n.getMessage('confirm_delete_folder'), '')) {
      const id = bookmark.getAttribute('data-sort');
      bk.removeTree(id, function() {
        bookmark.remove();
        rmCustomScreen(id);
        Helpers.customTrigger('updateFolderList', container, {
          detail: {
            isFolder: true
          }
        });
        Helpers.notifications(
          chrome.i18n.getMessage('notice_folder_removed')
        );
      });
    }
  }

  function rmCustomScreen(id, cb) {
    const screen = getCustomDial(id);
    if (!screen) return;

    const name = screen.split('/').pop();
    FS.deleteFile(`/images/${name}`, function() {
      const storage = JSON.parse(localStorage.getItem('custom_dials'));
      delete storage[id];
      localStorage.setItem('custom_dials', JSON.stringify(storage));
      cb && cb();
    });
  }

  function isValidUrl(url) {
    // The regex used in AngularJS to validate a URL + chrome internal pages & extension url & on-disk files
    const URL_REGEXP = /^(http|https|ftp|file|chrome|chrome-extension):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
    if (URL_REGEXP.test(url)) {
      return true;
    }
    return false;
  }

  function buildBookmarkHash(title, url) {
    if (title.length === 0) {
      return undefined;
    }
    // Chrome won't create bookmarks without HTTP
    if (!isValidUrl(url) && url.length !== 0) {
      url = 'http://' + url;
    }

    return { 'title': title, 'url': url };
  }

  function createBookmark(title, url) {
    let hash = buildBookmarkHash(title, url);
    if (hash !== undefined) {
      hash.parentId = container.getAttribute('data-folder');
      bk.create(hash, function(result) {
        let html;
        if (result.url) {
          html = genBookmark(result);
        } else {
          html = genFolder(result);
        }
        container.querySelector('.bookmark--nosort').insertAdjacentHTML('beforeBegin', html);
        const bookmark = container.querySelector(`[data-sort="${result.id}"]`);

        if (result.url) {
          if (localStorage.getItem('auto_generate_thumbnail') === 'true') {
            createScreen(bookmark, result.id, result.url);
          } else {
            const image = bookmark.querySelector('.bookmark__img');
            image.classList.add('bookmark__img--external');
            Helpers.imageLoaded(image.dataset.externalThumb, {
              done(data) {
                image.style.backgroundImage = `url(${data})`;
              },
              fail() {
                image.style.backgroundImage = image.dataset.failThumb;
              }
            });
          }
        } else {
          Helpers.customTrigger('updateFolderList', container, {
            detail: {
              isFolder: true
            }
          });
        }
      });


      return true;
    }
    alert(chrome.i18n.getMessage('alert_create_fail_bookmark'));
    return false;
  }

  function updateBookmark(id, title, url, move) {
    let hash = buildBookmarkHash(title, url);
    const bookmark = container.querySelector('[data-sort="' + id + '"]');
    const props = JSON.parse(bookmark.dataset.props);
    // Actually make sure the URL being modified is valid instead of always
    // prepending http:// to it creating new valid+invalid bookmark
    if (url.length !== 0 && !isValidUrl(url)) {
      hash = undefined;
    }
    if (hash !== undefined) {

      bk.update(id, hash, function(result) {
        // if the bookmark is moved to another folder
        if (move !== id && move !== result.parentId) {
          const destination = {parentId: move};
          // const bookmarkColumn = bookmark.closest('.column');
          chrome.bookmarks.move(id, destination, function() {
            bookmark.remove();

            // if it is a folder update folderList
            if (!result.url) {
              Helpers.customTrigger('updateFolderList', container, {
                detail: {
                  isFolder: true
                }
              });
            }
          });
        } else {
          // else update bookmark view
          bookmark.querySelector('.bookmark__link').href = (result.url) ? result.url : '#' + result.id;
          bookmark.querySelector('.bookmark__title').textContent = result.title;
          bookmark.querySelector('.bookmark__link').title = result.title;

          // If not folder
          if (result.url) {
            props.url = result.url;
          }
          props.title = result.title;
          bookmark.dataset.props = JSON.stringify(props);

          // if it is a folder update folderList
          if (!result.url) {
            Helpers.customTrigger('updateFolderList', container, {
              detail: {
                isFolder: true
              }
            });
          }
        }

        Helpers.notifications(chrome.i18n.getMessage('notice_bookmark_updated'));
      });
      return true;
    }
    alert(chrome.i18n.getMessage('alert_update_fail_bookmark'));
    return false;
  }

  return {
    init,
    createBookmark,
    updateBookmark,
    removeBookmark,
    removeFolder,
    generateFolderList,
    createScreen,
    uploadScreen,
    rmCustomScreen
  };

})();

export default Bookmarks;
