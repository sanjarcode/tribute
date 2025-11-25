/*eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }]*/

// Thanks to https://github.com/jeff-collins/ment.io

class TributeRange {
  constructor(tribute) {
    this.tribute = tribute;
    this.tribute.range = this;
  }

  getDocument() {
    let iframe;
    if (this.tribute.current.collection) {
      iframe = this.tribute.current.collection.iframe;
    }

    if (!iframe) {
      return document;
    }

    return iframe.contentWindow.document;
  }

  positionMenuAtCaret(scrollTo) {
    const context = this.tribute.current;
    let coordinates;

    if (!this.tribute.positionMenu) {
      this.tribute.menu.style.display = `block`;
      return;
    }

    if (!this.isContentEditable(context.element)) {
      coordinates = this.getTextAreaOrInputUnderlinePosition(
        context.element,
        context.mentionPosition + context.mentionText.length
      );
    } else {
      coordinates = this.getContentEditableCaretPosition(
        context.mentionPosition + context.mentionText.length
      );
    }

    this.tribute.menu.style.top = `${coordinates.top}px`;
    this.tribute.menu.style.left = `${coordinates.left}px`;
    this.tribute.menu.style.right = `${coordinates.right}px`;
    this.tribute.menu.style.bottom = `${coordinates.bottom}px`;
    this.tribute.menu.style["max-heigh"] = `${coordinates.maxHeight || 500}px`;
    this.tribute.menu.style["max-width"] = `${coordinates.maxWidth || 300}px`;
    this.tribute.menu.style.position = `${coordinates.position || "absolute"}`;
    this.tribute.menu.style.display = `block`;

    if (coordinates.left === "auto") {
      this.tribute.menu.style.left = "auto";
    }

    if (coordinates.top === "auto") {
      this.tribute.menu.style.top = "auto";

      //render elements in reverse order (TODO: add a use setting to cancel this if needed)
      this.tribute.menu.style.display = `flex`;
      this.tribute.menu.style.flexDirection = `column-reverse`;
    }

    if (scrollTo) this.scrollIntoView();
  }

  replaceTriggerText(text, originalEvent, item) {
    const context = this.tribute.current;
    const detail = {
      item: item,
      context: context,
      event: originalEvent,
      text: text,
    };
    const replaceEvent = new CustomEvent("tribute-replaced");

    if (!this.isContentEditable(context.element)) {
      const myField = this.tribute.current.element;
      const textSuffix =
        typeof this.tribute.replaceTextSuffix === "string"
          ? this.tribute.replaceTextSuffix
          : " ";
      text = this.stripHtml(text);
      text += textSuffix;
      const startPos = context.mentionPosition;
      let endPos =
        context.mentionPosition +
        context.mentionText.length +
        textSuffix.length;
      if (!this.tribute.autocompleteMode && context.mentionTriggerChar.length) {
        endPos += context.mentionTriggerChar.length - 1;
      }
      myField.value =
        myField.value.substring(0, startPos) +
        text +
        myField.value.substring(endPos, myField.value.length);
      myField.selectionStart = startPos + text.length;
      myField.selectionEnd = startPos + text.length;
    } else {
      const {
        sel,
        range
      } = this.getContentEditableSelectionStart(true);
      const staticRange = new StaticRange({startContainer: sel.anchorNode, startOffset: sel.anchorOffset - context.mentionText.length, endContainer: sel.anchorNode, endOffset: sel.anchorOffset });
      const textSuffix =
        typeof this.tribute.replaceTextSuffix === "string"
          ? this.tribute.replaceTextSuffix
          : "\xA0";
      text += textSuffix;

      context.element.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true,
        data: text,
        cancelable: true,
        inputType: "insertReplacementText",
        targetRanges: [staticRange],

      }));

      this.pasteContentEditable(
        text,
        context.mentionText.length + context.mentionTriggerChar.length
      );
    }

    context.element.dispatchEvent(
      new CustomEvent("input", { bubbles: true, detail: detail })
    );
    context.element.dispatchEvent(replaceEvent);
  }

  pasteContentEditable(html, numOfCharsToRemove) {
    const { sel, range } = this.getContentEditableSelectionStart(true);
    if (sel) {
      const strippedText = this.stripHtml(html);
      const isHTML = html !== strippedText;
      const useSimpleReplace =
        !isHTML &&
        sel.anchorOffset >= numOfCharsToRemove &&
        sel.anchorOffset <= sel.anchorNode.nodeValue.length;
      if (useSimpleReplace) {
        this.pasteText(sel, range, strippedText, numOfCharsToRemove);
      } else {
        this.pasteHtml(sel, range, html, numOfCharsToRemove);
      }
    }
  }

  pasteText(sel, range, text, numOfCharsToRemove) {
    const pre = sel.anchorNode.nodeValue.substring(
      0,
      sel.anchorOffset - numOfCharsToRemove
    );
    const post = sel.anchorNode.nodeValue.substring(
      sel.anchorOffset,
      sel.anchorNode.nodeValue.length
    );
    sel.anchorNode.nodeValue = pre + text + post;
    range.setStart(sel.anchorNode, pre.length + text.length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    sel.collapseToEnd();
  }

  pasteHtml(sel, _range, html, numOfCharsToRemove) {
    for (let index = 0; index < numOfCharsToRemove; index++) {
      sel.modify("extend", "backward", "character");
    }
    const newRange = sel.getRangeAt(0);
    newRange.deleteContents();

    const el = this.getDocument().createElement("div");
    el.innerHTML = html;
    const frag = this.getDocument().createDocumentFragment();
    let node, lastNode;

    while ((node = el.firstChild)) {
      lastNode = frag.appendChild(node);
    }
    newRange.insertNode(frag);

    // Preserve the selection
    if (lastNode) {
      newRange.setStart(lastNode, lastNode.length);
      newRange.setEnd(lastNode, lastNode.length);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
      sel.collapseToEnd();
    }
  }

  stripHtml(html) {
    const tmp = this.getDocument().createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  }

  getWindowSelection() {
    if (this.tribute.collection.iframe) {
      return this.tribute.collection.iframe.contentWindow.getSelection();
    }

    const rootNode = this.tribute.current.element.getRootNode();
    if (rootNode.getSelection) return rootNode.getSelection();
    else return window.getSelection();
  }

  getContentEditableSelectionStart(moveToEndOfWord) {
    const sel = this.getWindowSelection();
    if (!sel.isCollapsed) {
      return { sel: null, range: null, direction: null };
    }
    const direction = sel.anchorOffset <= sel.focusOffset;
    const range = sel.getRangeAt(0);
    const selectedElem = sel.anchorNode;
    const workingNodeContent = selectedElem.textContent;
    const selectStartOffset = range.startOffset;
    let nextChar =
      workingNodeContent.length > selectStartOffset
        ? workingNodeContent[selectStartOffset]
        : null;
    if (nextChar === null) {
      if (selectedElem.nextSibling && selectedElem.nextSibling.textContent) {
        const nextNodeText = selectedElem.nextSibling.textContent;
        nextChar = nextNodeText.length ? nextNodeText[0] : null;
      }
    }
    const nextCharIsSeparator =
      !this.tribute.autocompleteSeparator ||
      (nextChar && nextChar.match(this.tribute.autocompleteSeparator));
    sel.collapseToEnd();
    if (nextChar && !nextCharIsSeparator && moveToEndOfWord)
      sel.modify("move", "forward", "word");

    return { sel, range, direction };
  }

  getWholeWordsUpToCharIndex(str, minLen) {
    if (this.tribute.autocompleteSeparator) {
      let searchPos = 0;
      const arr = str
        .split(this.tribute.autocompleteSeparator)
        .filter(function (e) {
          return e.trim();
        });

      for (let i = 0, len = arr.length; i < len; i++) {
        const idx = str.indexOf(arr[i], searchPos);
        searchPos += arr[i].length;

        if (minLen >= idx && minLen <= idx + arr[i].length) {
          minLen = idx + arr[i].length;
          break;
        }
      }
    }

    const nextChar = str.length > minLen ? str[minLen] : "";
    return [str.substring(0, minLen), nextChar];
  }

  getTextForCurrentSelection() {
    const context = this.tribute.current;
    let effectiveRange = null;
    let nextChar = "";

    if (!this.isContentEditable(context.element)) {
      const textComponent = this.tribute.current.element;
      if (textComponent) {
        const startPos = textComponent.selectionStart;
        const endPos = textComponent.selectionEnd;

        if (textComponent.value && startPos >= 0 && startPos === endPos) {
          const result = this.getWholeWordsUpToCharIndex(
            textComponent.value,
            startPos
          );
          effectiveRange = result[0];
          nextChar = result[1];
        }
      }
    } else {
      const { sel, range, direction } =
        this.getContentEditableSelectionStart(true);
      if (sel) {
        const selectedElem = sel.anchorNode;
        const workingNodeContent = selectedElem.textContent;
        const selectStartOffset = sel.getRangeAt(0).startOffset;
        effectiveRange = sel.toString().trim();
        nextChar =
          workingNodeContent.length > selectStartOffset
            ? workingNodeContent[selectStartOffset]
            : "";

        for (
          let index = 0;
          index < this.tribute.numberOfWordsInContextText;
          index++
        ) {
          sel.modify("extend", "backward", "word");
          const newText = sel.toString();

          if (
            newText.length > effectiveRange.length &&
            newText.endsWith(effectiveRange)
          ) {
            // Workarounds Firefox issue, where selection sometimes collapse or move instead of extend
            effectiveRange = newText;
          }
        }

        this.restoreSelection(sel, range, direction);
      }
    }

    return { effectiveRange, nextChar };
  }

  getLastWordInText(text) {
    if (this.tribute.autocompleteSeparator) {
      const wordsArray = text.split(this.tribute.autocompleteSeparator);
      if (!wordsArray.length) return " ";
      return wordsArray[wordsArray.length - 1];
    }
    return text;
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  getTriggerInfo(allowSpaces, isAutocomplete) {
    let requireLeadingSpace = true;
    const { effectiveRange, nextChar } = this.getTextForCurrentSelection();
    if (effectiveRange === null) return null;
    const lastWordOfEffectiveRange = this.getLastWordInText(effectiveRange);

    if (isAutocomplete) {
      return {
        mentionPosition:
          effectiveRange.length - lastWordOfEffectiveRange.length,
        mentionText: lastWordOfEffectiveRange,
        fullText: effectiveRange,
        nextChar: nextChar,
        mentionTriggerChar: "",
      };
    }

    if (effectiveRange !== undefined && effectiveRange !== null) {
      let mostRecentTriggerCharPos = -1;
      let triggerChar;

      this.tribute.collection.forEach((config) => {
        const c = config.trigger;
        const regExpStr =
          "(" +
          (config.requireLeadingSpace ? "\\s" : "") +
          this.escapeRegExp(c) +
          ")(?!.*\\1)";
        const searchRes = effectiveRange.match(RegExp(regExpStr));
        const idx = (() => {
          if (searchRes)
            return searchRes.index + (config.requireLeadingSpace ? 1 : 0);
          if (effectiveRange.startsWith(c)) return 0;
          return -1;
        })();

        if (idx > mostRecentTriggerCharPos) {
          mostRecentTriggerCharPos = idx;
          triggerChar = c;
          requireLeadingSpace = config.requireLeadingSpace;
        }
      });

      if (
        mostRecentTriggerCharPos >= 0 &&
        (mostRecentTriggerCharPos === 0 ||
          !requireLeadingSpace ||
          /\s/.test(
            effectiveRange.substring(
              mostRecentTriggerCharPos - 1,
              mostRecentTriggerCharPos
            )
          ))
      ) {
        const currentTriggerSnippet = effectiveRange.substring(
          mostRecentTriggerCharPos + triggerChar.length,
          effectiveRange.length
        );

        triggerChar = effectiveRange.substring(
          mostRecentTriggerCharPos,
          mostRecentTriggerCharPos + triggerChar.length
        );
        const firstSnippetChar = currentTriggerSnippet.substring(0, 1);
        const leadingSpace =
          currentTriggerSnippet.length > 0 &&
          (firstSnippetChar === " " || firstSnippetChar === "\xA0");

        const trailingSpace =
          currentTriggerSnippet !== currentTriggerSnippet.trimEnd();

        if (!leadingSpace && (allowSpaces || !trailingSpace)) {
          return {
            mentionPosition: mostRecentTriggerCharPos,
            mentionText: currentTriggerSnippet,
            mentionTriggerChar: triggerChar,
            fullText: effectiveRange,
            nextChar: "",
          };
        }
      }
    }
  }

  isContentEditable(element) {
    return element.nodeName !== "INPUT" && element.nodeName !== "TEXTAREA";
  }

  isMenuOffScreen(coordinates, menuDimensions) {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const doc = this.getDocument().documentElement;
    const windowLeft =
      (window.pageXOffset || doc.scrollLeft) - (doc.clientLeft || 0);
    const windowTop =
      (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);

    const menuTop =
      typeof coordinates.top === "number"
        ? coordinates.top
        : coordinates.bottom - menuDimensions.height;
    const menuRight =
      typeof coordinates.right === "number"
        ? coordinates.right
        : coordinates.left + menuDimensions.width;
    const menuBottom =
      typeof coordinates.bottom === "number"
        ? coordinates.bottom
        : coordinates.top + menuDimensions.height;
    const menuLeft =
      typeof coordinates.left === "number"
        ? coordinates.left
        : coordinates.right - menuDimensions.width;

    return {
      top: menuTop < Math.floor(windowTop),
      right: menuRight > Math.ceil(windowLeft + windowWidth),
      bottom: menuBottom > Math.ceil(windowTop + windowHeight),
      left: menuLeft < Math.floor(windowLeft),
    };
  }

  getMenuDimensions() {
    // Width of the menu depends of its contents and position
    // We must check what its width would be without any obstruction
    // This way, we can achieve good positioning for flipping the menu
    const dimensions = {
      width: null,
      height: null,
    };

    this.tribute.menu.style.top = `0px`;
    this.tribute.menu.style.left = `0px`;
    this.tribute.menu.style.right = null;
    this.tribute.menu.style.bottom = null;
    this.tribute.menu.style.position = `fixed`;
    this.tribute.menu.style.visibility = `hidden`;
    this.tribute.menu.style.display = `block`;

    dimensions.width = this.tribute.menu.offsetWidth;
    dimensions.height = this.tribute.menu.offsetHeight;

    this.tribute.menu.style.display = `none`;
    this.tribute.menu.style.visibility = `visible`;

    return dimensions;
  }

  getTextAreaOrInputUnderlinePosition(element, position, _flipped) {
    const properties = [
      "direction",
      "boxSizing",
      "width",
      "height",
      "overflowX",
      "overflowY",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderStyle",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "fontStyle",
      "fontVariant",
      "fontWeight",
      "fontStretch",
      "fontSize",
      "fontSizeAdjust",
      "lineHeight",
      "fontFamily",
      "textAlign",
      "textTransform",
      "textIndent",
      "textDecoration",
      "letterSpacing",
      "wordSpacing",
    ];

    const div = this.getDocument().createElement("div");
    div.id = "input-textarea-caret-position-mirror-div";
    this.getDocument().body.appendChild(div);

    const style = div.style;
    const computed = window.getComputedStyle
      ? getComputedStyle(element)
      : element.currentStyle;

    style.whiteSpace = "pre-wrap";
    if (element.nodeName !== "INPUT") {
      style.wordWrap = "break-word";
    }

    // position off-screen
    style.position = "absolute";
    style.visibility = "hidden";

    // transfer the element's properties to the div
    properties.forEach((prop) => {
      style[prop] = computed[prop];
    });

    const span0 = this.getDocument().createElement("span");
    span0.textContent = element.value.substring(0, position);
    div.appendChild(span0);

    if (element.nodeName === "INPUT") {
      div.textContent = div.textContent.replace(/\s/g, " ");
    }

    //Create a span in the div that represents where the cursor
    //should be
    const span = this.getDocument().createElement("span");
    //we give it no content as this represents the cursor
    div.appendChild(span);

    const span2 = this.getDocument().createElement("span");
    span2.textContent = element.value.substring(position, position + 1);
    div.appendChild(span2);

    const rect = element.getBoundingClientRect();

    //position the div exactly over the element
    //so we can get the bounding client rect for the span and
    //it should represent exactly where the cursor is
    div.style.position = "fixed";
    div.style.left = rect.left + "px";
    div.style.top = rect.top + "px";
    div.style.width = rect.width + "px";
    div.style.height = rect.height + "px";
    div.scrollTop = element.scrollTop;

    const spanRect = span.getBoundingClientRect();
    const divRect = div.getBoundingClientRect();
    this.getDocument().body.removeChild(div);
    const clamp = function (number, min, max) {
      return Math.max(min, Math.min(number, max));
    };
    const finalRect = {
      height: Math.min(divRect.height, spanRect.height),
      left: clamp(spanRect.left, divRect.left, divRect.left + divRect.width),
      top: clamp(spanRect.top, divRect.top, divRect.top + divRect.height),
    };
    return this.getFixedCoordinatesRelativeToRect(finalRect);
  }

  getContentEditableCaretPosition(_selectedNodePosition) {
    const { sel, range, direction } =
      this.getContentEditableSelectionStart(false);
    const newRange = sel.getRangeAt(0);
    // restore selection
    this.restoreSelection(sel, range, direction);
    let rect = newRange.getBoundingClientRect();
    if (sel.anchorNode.parentNode) {
      const parentNodeRect = sel.anchorNode.parentNode.getBoundingClientRect();
      const clamp = function (number, min, max) {
        return Math.max(min, Math.min(number, max));
      };
      rect = {
        height: Math.min(parentNodeRect.height, rect.height),
        left: clamp(
          rect.left,
          parentNodeRect.left,
          parentNodeRect.left + parentNodeRect.width
        ),
        top: clamp(
          rect.top,
          parentNodeRect.top,
          parentNodeRect.top + parentNodeRect.height
        ),
      };
    }
    return this.getFixedCoordinatesRelativeToRect(rect);
  }

  getFixedCoordinatesRelativeToRect(rect) {
    const coordinates = {
      position: "fixed",
      left: rect.left,
      top: rect.top + rect.height,
    };

    const menuDimensions = this.getMenuDimensions();

    const availableSpaceOnTop = rect.top;
    const availableSpaceOnBottom =
      window.innerHeight - (rect.top + rect.height);

    //check to see where's the right place to put the menu vertically
    if (availableSpaceOnBottom < menuDimensions.height) {
      if (
        availableSpaceOnTop >= menuDimensions.height ||
        availableSpaceOnTop > availableSpaceOnBottom
      ) {
        coordinates.top = "auto";
        coordinates.bottom = window.innerHeight - rect.top;
        if (availableSpaceOnBottom < menuDimensions.height) {
          coordinates.maxHeight = availableSpaceOnTop;
        }
      } else {
        if (availableSpaceOnTop < menuDimensions.height) {
          coordinates.maxHeight = availableSpaceOnBottom;
        }
      }
    }

    const availableSpaceOnLeft = rect.left;
    const availableSpaceOnRight = window.innerWidth - rect.left;

    //check to see where's the right place to put the menu horizontally
    if (availableSpaceOnRight < menuDimensions.width) {
      if (
        availableSpaceOnLeft >= menuDimensions.width ||
        availableSpaceOnLeft > availableSpaceOnRight
      ) {
        coordinates.left = "auto";
        coordinates.right = window.innerWidth - rect.left;
        if (availableSpaceOnRight < menuDimensions.width) {
          coordinates.maxWidth = availableSpaceOnLeft;
        }
      } else {
        if (availableSpaceOnLeft < menuDimensions.width) {
          coordinates.maxWidth = availableSpaceOnRight;
        }
      }
    }

    return coordinates;
  }

  scrollIntoView(_elem) {
    const reasonableBuffer = 20;
    const maxScrollDisplacement = 100;
    let clientRect;
    let e = this.menu;

    if (typeof e === "undefined") return;

    while (clientRect === undefined || clientRect.height === 0) {
      clientRect = e.getBoundingClientRect();

      if (clientRect.height === 0) {
        e = e.childNodes[0];
        if (e === undefined || !e.getBoundingClientRect) {
          return;
        }
      }
    }

    const elemTop = clientRect.top;
    const elemBottom = elemTop + clientRect.height;

    if (elemTop < 0) {
      window.scrollTo(
        0,
        window.pageYOffset + clientRect.top - reasonableBuffer
      );
    } else if (elemBottom > window.innerHeight) {
      let maxY = window.pageYOffset + clientRect.top - reasonableBuffer;

      if (maxY - window.pageYOffset > maxScrollDisplacement) {
        maxY = window.pageYOffset + maxScrollDisplacement;
      }

      let targetY = window.pageYOffset - (window.innerHeight - elemBottom);

      if (targetY > maxY) {
        targetY = maxY;
      }

      window.scrollTo(0, targetY);
    }
  }

  restoreSelection(sel, range, directionFwd = true) {
    sel.removeAllRanges();

    if (directionFwd) {
      sel.addRange(range);
    } else {
      const endRange = range.cloneRange();
      endRange.collapse(false);
      sel.addRange(endRange);
      sel.extend(range.startContainer, range.startOffset);
    }
  }
}

export default TributeRange;
