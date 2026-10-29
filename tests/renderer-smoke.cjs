// Real React → authenticated local API → SQLite checks, using an isolated profile.
const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const temporary = process.env.APPA_RENDERER_TEST_ROOT;
if (!temporary)
  throw new Error("Run renderer checks through npm run test:renderer.");
const profile = path.join(temporary, "profile");
mkdirSync(profile);
app.setPath("userData", profile);
app.setPath("sessionData", profile);
app.disableHardwareAcceleration();
let window;
let runtime;
let exitCode = 1;
app.on("window-all-closed", () => {});
const problems = [];
let run;
async function waitFor(expression, label = expression) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    if (await run(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Renderer timed out: ${label}`);
}
async function click(selector) {
  await waitFor(
    `!!document.querySelector(${JSON.stringify(selector)})`,
    selector,
  );
  await run(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function button(text, root = "document") {
  const expression = `[...${root}.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(text)})`;
  await waitFor(`!!(${expression}) && !(${expression}).disabled`, text);
  await run(`(${expression}).click()`);
}
async function type(selector, value) {
  await waitFor(
    `!!document.querySelector(${JSON.stringify(selector)})`,
    selector,
  );
  await run(
    `(() => { const input = document.querySelector(${JSON.stringify(selector)}); if (input.isContentEditable) { input.focus(); input.textContent = ${JSON.stringify(value)}; const range = document.createRange(); range.selectNodeContents(input); range.collapse(false); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); } else Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
  );
  await new Promise((resolve) => setTimeout(resolve, 25));
}
async function stored() {
  return run(
    `(async () => { const session = await (await fetch('/api/session')).json(); return (await fetch('/api/calendar/load', { method:'POST', headers:{'Content-Type':'application/json','X-Calendar-CSRF':session.csrf}, body:JSON.stringify({scope:'main'}) })).json(); })()`,
  );
}
async function durable() {
  await waitFor(
    `window.dispatchEvent(new Event('beforeunload', {cancelable:true}))`,
    "all edits saved and drafts closed",
  );
}
async function addTodo(title) {
  await type(".todo-add input", title);
  await run(`document.querySelector('.todo-add').requestSubmit()`);
  await waitFor(
    `document.querySelector('.todo-cards')?.textContent.includes(${JSON.stringify(title)})`,
  );
}
app.whenReady().then(async () => {
  try {
    const { startLocalApp } =
      await import("../dist/runtime/desktop/local-server.js");
    const cal = await import("../dist/runtime/src/calendar.js");
    const { openCalendarStore } =
      await import("../dist/runtime/server/calendar-store.js");
    const secret = randomBytes(32).toString("hex");
    const dataRoot = path.join(temporary, "data");
    runtime = await startLocalApp({
      staticRoot: path.resolve(__dirname, "../dist/renderer-test"),
      dataRoot,
      deviceSecret: secret,
    });
    window = new BrowserWindow({
      show: false,
      width: 1440,
      height: 980,
      webPreferences: {
        preload: path.resolve(__dirname, "../dist/runtime/desktop/preload.cjs"),
        partition: `appa-renderer-${randomBytes(8).toString("hex")}`,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    window.webContents.on("console-message", (details) => {
      if (details.level === "error") problems.push(details.message);
    });
    window.webContents.on("render-process-gone", (_event, details) =>
      problems.push(`Renderer exited: ${details.reason}`),
    );
    await window.webContents.session.cookies.set({
      url: runtime.origin,
      name: "calendar-device",
      value: secret,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    run = async (script) => {
      try {
        return await window.webContents.executeJavaScript(script);
      } catch (error) {
        throw new Error(`${error.message}\nRenderer script: ${script.slice(0, 200)}`, {cause: error});
      }
    };
    await window.loadURL(runtime.origin);
    await waitFor(`!!document.querySelector('.todo-add input')`);
    await durable();

    // A temporary transport failure must retain new edits and expose safe recovery.
    await run(
      `window.originalFetch = window.fetch.bind(window); window.failNextSave = true; window.fetch = (...args) => { if (String(args[0]).endsWith('/api/calendar/save') && window.failNextSave) { window.failNextSave = false; return Promise.reject(new TypeError('Synthetic temporary save failure')); } return window.originalFetch(...args); }; void 0;`,
    );
    await addTodo("Renderer saved item");
    await waitFor(
      `document.querySelector('.alert')?.textContent.includes('Retry save')`,
    );
    await addTodo("Renderer latest item");
    await button("Retry save");
    await waitFor(`!document.querySelector('.alert')`);
    await durable();
    assert.deepEqual(
      (await stored()).state.todos.map((todo) => todo.title),
      ["Renderer saved item", "Renderer latest item"],
    );
    const loaded = new Promise((resolve) =>
      window.webContents.once("did-finish-load", resolve),
    );
    window.webContents.reload();
    await loaded;
    await waitFor(
      `document.querySelector('.todo-cards')?.textContent.includes('Renderer latest item')`,
    );
    console.log("PASS renderer: failed save → retry latest edits → reload");

    // Event creation/editing and keyboard resizing must use real handlers and Undo.
    await button("Create event");
    await type('.event-creator input[name="title"]', "Renderer appointment");
    const tomorrow = cal.addDays(
      cal.localDate(Intl.DateTimeFormat().resolvedOptions().timeZone),
      1,
    );
    await type('.event-creator input[type="date"]', tomorrow);
    await type('.event-creator input[name="start"]', "09:00");
    await type('.event-creator input[name="end"]', "09:30");
    await button("Save event");
    await waitFor(`!document.querySelector('.event-creator')`);
    await durable();
    let event = (await stored()).state.tasks.find(
      (task) => task.title === "Renderer appointment",
    );
    assert.equal(event.start, 540);
    assert.equal(event.minutes, 30);
    await click(`.timeline-event[data-task-id="${event.id}"] .calendar-event`);
    await button("Edit", "document.querySelector('.task-card')");
    await type(
      '.task-card-editor input[name="title"]',
      "Renderer edited appointment",
    );
    await button("Update", "document.querySelector('.task-card')");
    await durable();
    assert.equal(
      (await stored()).state.tasks.find((task) => task.id === event.id).title,
      "Renderer edited appointment",
    );
    await click(".task-card-close");
    await run(
      `document.querySelector('.timeline-event[data-task-id="${event.id}"] .event-resize-handle.end').dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowDown', bubbles:true }));`,
    );
    await durable();
    assert.equal(
      (await stored()).state.tasks.find((task) => task.id === event.id).minutes,
      35,
    );
    await button("Undo", "document.querySelector('.undo-toast')");
    await durable();
    assert.equal(
      (await stored()).state.tasks.find((task) => task.id === event.id).minutes,
      30,
    );
    await run(
      `(() => { const source = document.querySelector('.timeline-event[data-task-id="${event.id}"] .calendar-event'); window.testTransfer = new DataTransfer(); source.dispatchEvent(new DragEvent('dragstart', {bubbles:true, dataTransfer:window.testTransfer, clientY:source.getBoundingClientRect().top})); })()`,
    );
    await run(
      `(() => { const column = document.querySelector('.timeline-event[data-task-id="${event.id}"]').closest('.day-column'); const rect = column.getBoundingClientRect(); column.dispatchEvent(new DragEvent('dragover', {bubbles:true, cancelable:true, dataTransfer:window.testTransfer, clientY:rect.top + rect.height * 660 / 1440})); })()`,
    );
    await run(
      `(() => { const column = document.querySelector('.timeline-event[data-task-id="${event.id}"]').closest('.day-column'); const rect = column.getBoundingClientRect(); column.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:window.testTransfer, clientY:rect.top + rect.height * 660 / 1440})); })()`,
    );
    await durable();
    assert.equal(
      (await stored()).state.tasks.find((task) => task.id === event.id).start,
      660,
    );
    await button("Undo", "document.querySelector('.undo-toast')");
    await durable();
    assert.equal(
      (await stored()).state.tasks.find((task) => task.id === event.id).start,
      540,
    );
    console.log("PASS renderer: create → edit → resize/drag → Undo → SQLite");

    // Dirty draft navigation must wait for an explicit discard.
    await button("Create event");
    await type('.event-creator input[name="title"]', "Unsaved draft");
    await button("Cancel", "document.querySelector('.event-creator')");
    await waitFor(
      `document.querySelector('dialog[open]')?.textContent.includes('Discard changes?')`,
    );
    await button("Keep editing");
    assert.equal(
      await run(
        `document.querySelector('.event-creator input[name="title"]').value`,
      ),
      "Unsaved draft",
    );
    await button("Cancel", "document.querySelector('.event-creator')");
    await button("Discard changes");
    await waitFor(`!document.querySelector('.event-creator')`);
    console.log(
      "PASS renderer: dirty draft keeps edits until explicit discard",
    );

    // Supply only an AI proposal, then exercise the actual reviewed local apply route.
    await durable();
    const store = openCalendarStore(dataRoot);
    const current = store.load("main");
    const proposalId = store.putProposal(
      "main",
      "todos",
      [{ action: "add", title: "Reviewed renderer item", minutes: 30 }],
      current.storageVersion,
    );
    store.close();
    await run(`window.originalFetch = window.fetch.bind(window); window.fetch = async (...args) => {
      const url = String(args[0]);
      if (url.endsWith('/api/assistant')) return new Response(JSON.stringify({kind:'todo_proposal', message:'Review this synthetic item.', references:[], proposalId:${JSON.stringify(proposalId)}, todoChanges:[{id:'preview',before:null,after:{id:'preview',title:'Reviewed renderer item',minutes:30,done:false}}]}), {headers:{'Content-Type':'application/json'}});
      const response = await window.originalFetch(...args);
      if (url.endsWith('/api/session')) { const data = await response.json(); return new Response(JSON.stringify({...data, connected:true, models:[{id:'synthetic-model',name:'Synthetic model'}]}), {headers:{'Content-Type':'application/json'}}); }
      return response;
    }; window.dispatchEvent(new Event('focus'));`);
    await type('[role="textbox"][aria-label="Message Appa"]', "Add a reviewed item");
    await run(
      `document.querySelector('[role="textbox"][aria-label="Message Appa"]').closest('form').requestSubmit()`,
    );
    await waitFor(`document.body.textContent.includes('Apply to do changes')`);
    assert.equal(
      (await stored()).state.todos.some(
        (todo) => todo.title === "Reviewed renderer item",
      ),
      false,
    );
    await button("Apply to do changes");
    await waitFor(
      `document.querySelector('.todo-cards')?.textContent.includes('Reviewed renderer item')`,
    );
    await durable();
    assert.equal(
      (await stored()).state.todos.some(
        (todo) => todo.title === "Reviewed renderer item",
      ),
      true,
    );
    await button("Undo", "document.querySelector('.undo-toast')");
    await durable();
    assert.equal(
      (await stored()).state.todos.some(
        (todo) => todo.title === "Reviewed renderer item",
      ),
      false,
    );
    console.log(
      "PASS renderer: proposal changes nothing until Apply; Undo restores state",
    );

    // Date/time chips are local: finishing creates the calendar box with no AI/review window.
    const composer = '[role="textbox"][aria-label="Message Appa"]';
    await run(`window.eventRequests = 0; window.fetch = async (...args) => {
      const url = String(args[0]);
      if (url.endsWith('/api/assistant')) { window.eventRequests++; throw new Error('Direct events must not call AI'); }
      const response = await window.originalFetch(...args);
      if (url.endsWith('/api/session')) { const data = await response.json(); return new Response(JSON.stringify({...data, connected:false, models:[]}), {headers:{'Content-Type':'application/json'}}); }
      return response;
    }; window.dispatchEvent(new Event('focus')); document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));`);
    const sendChat = () => run(`document.querySelector(${JSON.stringify(composer)}).closest('form').requestSubmit()`);
    const compact = async () => {
      assert.equal(await run(`document.querySelector('.floating-chat').classList.contains('active')`), false);
      assert.equal(await run(`!!document.querySelector('.event-creator, .task-card, .chat-event-proposal')`), false);
    };
    const capture = async (name) => {
      if (!process.env.APPA_RENDERER_SCREENSHOTS) return;
      const [width, height] = window.getSize();
      window.setSize(width + 1, height);
      window.setSize(width, height);
      await new Promise(resolve => setTimeout(resolve, 200));
      mkdirSync(process.env.APPA_RENDERER_SCREENSHOTS, {recursive:true});
      writeFileSync(path.join(process.env.APPA_RENDERER_SCREENSHOTS, name), (await window.webContents.capturePage()).toPNG());
    };
    const beforeEvent = await stored();
    await type(composer, 'Review launch notes tomorrow at 2:55pm for 45 min');
    await waitFor(`document.querySelector('[data-event-token="time"]')?.textContent.includes('14:55')`);
    assert.equal(await run(`document.querySelectorAll('[data-event-token="date"]').length`), 1);
    assert.equal(await run(`document.querySelectorAll('[data-event-token="time"]').length`), 1);
    assert.equal(await run(`!!document.querySelector('[data-event-token="schedule"]')`), false);
    assert.equal(await run(`document.querySelector('[data-event-token="duration"]').textContent`), '45 min');
    await compact();
    await capture('inline-event-typing.png');
    await click('[data-event-token="time"]');
    await type('.composer-token-picker input[type="time"]', '14:00');
    await capture('inline-event-picker.png');
    await button('Done', "document.querySelector('.composer-token-picker')");
    await waitFor(`document.querySelector('[data-event-token="time"]')?.textContent.includes('14:00')`);
    await compact();
    // A real key event exercises Enter and the contenteditable handler.
    await run(`document.querySelector(${JSON.stringify(composer)}).focus()`);
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
    window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
    await waitFor(`document.querySelector('.composer-text').dataset.empty === 'true'`);
    await durable();
    let direct = (await stored()).state.tasks.find(task => task.title === 'Review launch notes');
    assert.ok(direct);
    assert.equal(direct.start, 840);
    assert.equal(direct.minutes, 45);
    assert.equal(direct.date, tomorrow);
    assert.equal(await run('window.eventRequests'), 0);
    await compact();
    await waitFor(`!!document.querySelector('.timeline-event[data-task-id="${direct.id}"] .calendar-event.selected')`);
    await capture('inline-event-created.png');
    await button('Undo', "document.querySelector('.undo-toast')");
    await durable();
    assert.deepEqual((await stored()).state.tasks, beforeEvent.state.tasks);

    const press = async (keyCode, modifiers = []) => {
      window.webContents.sendInputEvent({type:'keyDown', keyCode, modifiers});
      window.webContents.sendInputEvent({type:'keyUp', keyCode, modifiers});
      await new Promise(resolve => setTimeout(resolve, 35));
    };
    const rawComposer = () => run(`Array.from(document.querySelector('.composer-text').childNodes).map(n => n.dataset?.raw ?? n.textContent).join('')`);
    const caretAtTag = async (kind, side) => run(`(() => {
      const root = document.querySelector('.composer-text');
      const tag = root.querySelector('[data-event-token="${kind}"]');
      root.focus();
      const range = document.createRange();
      range.${side === 'before' ? 'setStartBefore' : 'setStartAfter'}(tag);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
    })()`);

    // A deletion unwraps the touched tag first, then the next key edits ordinary text.
    await type(composer, 'Backspace test tomorrow at 2pm');
    await caretAtTag('time', 'after');
    await press('Backspace');
    assert.equal(await rawComposer(), 'Backspace test tomorrow at 2pm');
    assert.equal(await run(`!!document.querySelector('[data-event-token="time"]')`), false);
    assert.equal(await run(`!!document.querySelector('[data-event-token="date"]')`), true);
    await press('Backspace');
    assert.equal(await rawComposer(), 'Backspace test tomorrow at 2p');
    assert.equal(await run(`!!document.querySelector('[data-event-token="time"]')`), false);
    await window.webContents.insertText('m');
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(await rawComposer(), 'Backspace test tomorrow at 2pm');
    assert.equal(await run(`!!document.querySelector('[data-event-token="time"]')`), true, 'repairing the text must recreate the time tag');
    await compact();

    await type(composer, '');
    await type(composer, 'Forward deletion test tomorrow at 2pm');
    await caretAtTag('date', 'before');
    await press('Delete');
    assert.equal(await rawComposer(), 'Forward deletion test tomorrow at 2pm');
    assert.equal(await run(`!!document.querySelector('[data-event-token="date"]')`), false);
    await press('Delete');
    assert.equal(await rawComposer(), 'Forward deletion test omorrow at 2pm');
    await window.webContents.insertText('t');
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(await rawComposer(), 'Forward deletion test tomorrow at 2pm');
    assert.equal(await run(`!!document.querySelector('[data-event-token="date"]')`), true, 'repair after forward Delete must recreate the date tag');
    await compact();

    // Every recognised detail can recover after unwrapping and ordinary text editing.
    for (const [kind, source] of [
      ['date', 'Repair date tomorrow'],
      ['date', 'Repair ISO 2026-10-30'],
      ['time', 'Repair clock tomorrow at 14:55'],
      ['duration', 'Repair duration tomorrow at 2pm for 45 minutes'],
      ['repeat', 'Repair repeat tomorrow at 2pm every week'],
      ['allDay', 'Repair whole day tomorrow all day'],
    ]) {
      await type(composer, '');
      await type(composer, source);
      await caretAtTag(kind, 'after');
      await press('Backspace');
      assert.equal(await rawComposer(), source, `${kind}: first Backspace only unwraps`);
      assert.equal(await run(`!!document.querySelector('[data-event-token="${kind}"]')`), false);
      await press('Backspace');
      assert.equal(await rawComposer(), source.slice(0, -1), `${kind}: next Backspace deletes one character`);
      assert.equal(await run(`!!document.querySelector('[data-event-token="${kind}"]')`), false, `${kind}: deletion stays plain even when the shorter text is still valid`);
      await window.webContents.insertText(source.at(-1));
      await new Promise(resolve => setTimeout(resolve, 35));
      assert.equal(await rawComposer(), source, `${kind}: repair preserves the complete raw text`);
      assert.equal(await run(`!!document.querySelector('[data-event-token="${kind}"]')`), true, `${kind}: typing a valid detail recognises the tag again`);
      await compact();
    }

    // Typing elsewhere must not re-wrap an untouched detail that is still being edited.
    await type(composer, '');
    await type(composer, 'Other edits tomorrow at 2pm');
    await caretAtTag('date', 'after');
    await press('Backspace');
    await run(`(() => {const root=document.querySelector('.composer-text'); const range=document.createRange(); range.setStart(root.firstChild,0); range.collapse(true); const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range);})()`);
    await window.webContents.insertText('New ');
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(await rawComposer(), 'New Other edits tomorrow at 2pm');
    assert.equal(await run(`!!document.querySelector('[data-event-token="date"]')`), false, 'an unrelated title insertion must leave the unwrapped date alone');
    assert.equal(await run(`!!document.querySelector('[data-event-token="time"]')`), true);
    await run(`(() => {const root=document.querySelector('.composer-text'); const text=Array.from(root.childNodes).find(node=>node.nodeType===Node.TEXT_NODE && node.textContent.includes('tomorrow')); const range=document.createRange(); range.setStart(text,text.textContent.indexOf('tomorrow')+8); range.collapse(true); const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range);})()`);
    await press('Backspace');
    assert.equal(await rawComposer(), 'New Other edits tomorro at 2pm');
    await window.webContents.insertText('w');
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(await rawComposer(), 'New Other edits tomorrow at 2pm');
    assert.equal(await run(`!!document.querySelector('[data-event-token="date"]')`), true, 'repair still recognises the date after unrelated text shifted its position');
    await compact();
    console.log('PASS renderer: typing repairs date, ISO date, time, duration, repeat and all-day tags after Backspace/Delete; unrelated text edits retain raw details');

    // Selected tags also become raw text before a second deletion removes the selection.
    await type(composer, '');
    await type(composer, 'Selection test tomorrow at 2pm for 45 min');
    await run(`(() => {
      const root=document.querySelector('.composer-text'); root.focus();
      const range=document.createRange();
      range.setStartBefore(root.querySelector('[data-event-token="date"]'));
      range.setEndAfter(root.querySelector('[data-event-token="time"]'));
      const selection=window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    })()`);
    await press('Backspace');
    assert.equal(await rawComposer(), 'Selection test tomorrow at 2pm for 45 min');
    assert.equal(await run(`document.querySelectorAll('[data-event-token="date"], [data-event-token="time"]').length`), 0);
    await press('Backspace');
    assert.equal(await rawComposer(), 'Selection test  for 45 min');
    await compact();

    // Word deletion that reaches a tag also unwraps it before discarding any text.
    await type(composer, '');
    await type(composer, 'Shortcut test tomorrow at 2pm ');
    await press('Backspace', ['control']);
    assert.equal(await rawComposer(), 'Shortcut test tomorrow at 2pm ');
    assert.equal(await run(`!!document.querySelector('[data-event-token="time"]')`), false);
    await compact();

    await type(composer, '');
    await type(composer, 'Focused deletion tomorrow at 2pm');
    await run(`document.querySelector('[data-event-token="time"]').focus()`);
    await press('Delete');
    assert.equal(await rawComposer(), 'Focused deletion tomorrow at 2pm');
    assert.equal(await run(`!!document.querySelector('[data-event-token="time"]')`), false);
    await compact();

    // Repeated arrows retain tag focus; adjacent caret arrows use the same date/time adjustment.
    await type(composer, '');
    await type(composer, 'Keyboard event tomorrow at 2pm for 45 min');
    await caretAtTag('time', 'after');
    await press('Up', ['shift']);
    assert.equal(await rawComposer(), 'Keyboard event tomorrow at 2pm for 45 min', 'Shift+Up selects text without changing the schedule');
    await run(`document.querySelector('[data-event-token="date"]').focus()`);
    await press('Up');
    await press('Up');
    await press('Down');
    assert.equal(await run(`document.activeElement.dataset.eventToken`), 'date');
    await run(`document.querySelector('[data-event-token="time"]').focus()`);
    await press('Up');
    await press('Up');
    await press('Down');
    assert.equal(await run(`document.activeElement.dataset.eventToken`), 'time');
    assert.equal(await run(`document.querySelector('[data-event-token="time"]').textContent`), '14:05');
    await caretAtTag('time', 'before');
    await press('Down');
    assert.equal(await run(`document.querySelector('[data-event-token="time"]').textContent`), '14:00');
    await caretAtTag('time', 'after');
    await press('Up');
    assert.equal(await run(`document.querySelector('[data-event-token="time"]').textContent`), '14:05');
    assert.equal(await run(`!!document.querySelector('.composer-token-picker')`), false);
    await compact();
    await press('Enter');
    await durable();
    const keyboardEvent = (await stored()).state.tasks.find(task => task.title === 'Keyboard event');
    assert.equal(keyboardEvent.date, cal.addDays(tomorrow, 1));
    assert.equal(keyboardEvent.start, 845);
    assert.equal(keyboardEvent.minutes, 45);
    await button('Undo', "document.querySelector('.undo-toast')");
    await durable();
    assert.deepEqual((await stored()).state.tasks, beforeEvent.state.tasks);
    // Arrow edits retain a range's duration and an implicit weekly recurrence.
    await type(composer, 'Team review every Friday from 2pm to 3pm');
    await run(`document.querySelector('[data-event-token="date"]').focus()`);
    await press('Up');
    await run(`document.querySelector('[data-event-token="time"]').focus()`);
    await press('Up');
    await sendChat();
    await durable();
    const weeklyState = (await stored()).state;
    const weeklyRange = weeklyState.tasks.find(task => task.title === 'Team review');
    assert.equal(new Date(`${weeklyRange.date}T12:00:00Z`).getUTCDay(), 6);
    assert.equal(weeklyRange.start, 845);
    assert.equal(weeklyRange.minutes, 60);
    assert.equal(weeklyState.eventSeries.find(series => series.id === weeklyRange.eventSeriesId).repeat, 'weekly');
    await button('Undo', "document.querySelector('.undo-toast')");
    await durable();
    assert.deepEqual((await stored()).state.tasks, beforeEvent.state.tasks);
    console.log('PASS renderer: separate date/time tags; Backspace/Delete unwrap before normal editing; selected tags retain text; repeated and adjacent arrow adjustments save correctly');

    // Native incremental typing must survive chip replacement without losing suffixes/caret.
    await type(composer, '');
    for (const fragment of ['Native typing Fri', 'day', ' at 2:', '55', 'pm', ' for 45', ' min']) {
      await window.webContents.insertText(fragment);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    await waitFor(`document.querySelector('[data-event-token="time"]')?.textContent.includes('14:55')`);
    assert.equal(await run(`document.querySelector('[data-event-token="duration"]').dataset.raw`), 'for 45 min');
    const nativeRaw = await run(`Array.from(document.querySelector('.composer-text').childNodes).map(n => n.dataset?.raw ?? n.textContent).join('')`);
    assert.equal(nativeRaw, 'Native typing Friday at 2:55pm for 45 min');
    await sendChat();
    await durable();
    const native = (await stored()).state.tasks.find(task => task.title === 'Native typing');
    assert.ok(native);
    assert.equal(native.start, 895);
    assert.equal(native.minutes, 45);
    await button('Undo', "document.querySelector('.undo-toast')");
    await durable();

    // Removing the date leaves an incomplete draft in the same composer.
    await type(composer, 'Incomplete tomorrow at 2pm for 45 min');
    await run(`(() => { const chip=document.querySelector('[data-event-token="date"]'); chip.remove(); document.querySelector('.composer-text').dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await sendChat();
    await waitFor(`document.querySelector('.composer-feedback[role="alert"]')?.textContent.includes('Add a date')`);
    await compact();
    assert.deepEqual((await stored()).state.tasks, beforeEvent.state.tasks);

    // Conflicts retain the draft; editing its chip can save an event ending at midnight.
    await type(composer, 'Conflicting review tomorrow at 9am');
    await sendChat();
    await waitFor(`document.querySelector('.composer-feedback[role="alert"]')?.textContent.includes('overlaps')`);
    assert.deepEqual((await stored()).state.tasks, beforeEvent.state.tasks);
    await click('[data-event-token="time"]');
    await type('.composer-token-picker input[type="time"]', '23:30');
    await button('Done', "document.querySelector('.composer-token-picker')");
    await sendChat();
    await durable();
    const midnight = (await stored()).state.tasks.find(task => task.title === 'Conflicting review');
    assert.equal(midnight.start, 1410);
    assert.equal(midnight.minutes, 30);
    await compact();
    await button('Undo', "document.querySelector('.undo-toast')");
    await durable();

    // Editing a time range must retain its duration when it becomes a start-time chip.
    await type(composer, 'Range review tomorrow from 2pm to 3pm');
    await click('[data-event-token="time"]');
    await type('.composer-token-picker input[type="time"]', '16:00');
    await button('Done', "document.querySelector('.composer-token-picker')");
    await sendChat();
    await durable();
    const range = (await stored()).state.tasks.find(task => task.title === 'Range review');
    assert.equal(range.start, 960);
    assert.equal(range.minutes, 60);
    await button('Undo', "document.querySelector('.undo-toast')");
    await durable();

    // A small chip picker converts a timed draft to an all-day repeating event.
    await type(composer, 'Launch day tomorrow at 2pm for 45 min every week');
    await click('[data-event-token="date"]');
    await click('.composer-token-picker input[type="checkbox"]');
    await button('Done', "document.querySelector('.composer-token-picker')");
    await sendChat();
    await durable();
    const allDayState = (await stored()).state;
    const allDay = allDayState.tasks.find(task => task.title === 'Launch day');
    assert.equal(allDay.allDay, true);
    assert.equal(allDay.start, 0);
    assert.equal(allDay.minutes, 1440);
    assert.equal(allDayState.eventSeries.find(series => series.id === allDay.eventSeriesId).repeat, 'weekly');
    await compact();
    await button('Undo', "document.querySelector('.undo-toast')");
    await durable();

    // On narrow weeks the new card is brought into the visible horizontal and vertical area.
    window.setSize(390, 844);
    await type(composer, 'Morning review Sunday at 5am for 45 min');
    await capture('inline-event-narrow-typing.png');
    await sendChat();
    await durable();
    const narrow = (await stored()).state.tasks.find(task => task.title === 'Morning review');
    await waitFor(`(() => {const card=document.querySelector('.timeline-event[data-task-id="${narrow.id}"] .calendar-event'); if(!card) return false; const r=card.getBoundingClientRect(); const area=document.querySelector('.week-scroll').getBoundingClientRect(); const header=document.querySelector('.timeline-heading').getBoundingClientRect(); return r.left>=area.left && r.right<=area.right+1 && r.top>=header.bottom && r.bottom<area.bottom;})()`, 'created event visible on narrow week');
    await compact();
    await capture('inline-event-narrow-created.png');
    assert.equal(await run(`document.querySelector('.composer-text').scrollWidth <= document.querySelector('.composer-text').clientWidth`), true);
    await button('Undo', "document.querySelector('.undo-toast')");
    await durable();
    window.setSize(1440, 980);
    assert.equal(await run('window.eventRequests'), 0);
    assert.deepEqual((await stored()).state.tasks, beforeEvent.state.tasks);
    console.log('PASS renderer: inline date/time chips → Enter → calendar box/SQLite/Undo without AI or expanded chat; native typing, chip edits, missing details, conflicts, midnight, all-day recurrence and narrow reveal');

    // Seed only this isolated profile, then exercise the shared goal/calendar row.
    const reloadGoalPage = () => new Promise(resolve => {
      window.webContents.once('did-finish-load',resolve);
      window.webContents.reload();
    });
    await durable();
    const goalStore = openCalendarStore(dataRoot);
    const goalSnapshot = goalStore.load('main');
    const goalToday = cal.localDate(goalSnapshot.state.settings.timezone);
    const goalFixture = {...goalSnapshot.state,
      goals:[...goalSnapshot.state.goals,{id:'renderer-goal',name:'Renderer goal',color:'slate',status:'active',recurrence:null}],
      tasks:[...goalSnapshot.state.tasks,{id:'renderer-goal-task',goalId:'renderer-goal',title:'Goal row task',date:goalToday,start:1080,minutes:30,slotId:'renderer-goal-task',status:'pending',dependsOn:[]}],
    };
    for(let index=0;index<16;index++) goalFixture.tasks.push({id:`goal-history-${index}`,goalId:'renderer-goal',title:`Earlier step ${index+1}`,date:cal.addDays(goalToday,-index-1),start:1080,minutes:30,slotId:`goal-history-${index}`,status:'done',dependsOn:[]});
    for(let index=0;index<16;index++) goalFixture.tasks.push({id:`goal-missed-${index}`,goalId:'renderer-goal',title:`Missed step ${index+1}`,date:cal.addDays(goalToday,-index-30),start:1080,minutes:30,slotId:`goal-missed-${index}`,status:'consolidated',dependsOn:[]});
    goalStore.save('main',goalFixture,goalSnapshot.storageVersion);
    goalStore.close();
    await reloadGoalPage();
    await waitFor(`!!document.querySelector('button[aria-label="Goal options for Renderer goal"]')`);
    await button('Today');
    await waitFor(`!!document.querySelector('.timeline-event[data-task-id="renderer-goal-task"]')`);
    assert.equal(await run(`document.querySelectorAll('.goals-rail .calendar-group-item[data-group-kind="goal"] .calendar-group-row').length`),1);
    await click('input[aria-label="Show Renderer goal events"]');
    await waitFor(`!document.querySelector('.timeline-event[data-task-id="renderer-goal-task"]')`);
    await durable();
    assert.equal((await stored()).state.goals.find(goal=>goal.id==='renderer-goal').visible,false);
    await reloadGoalPage();
    await waitFor(`!!document.querySelector('input[aria-label="Show Renderer goal events"]')`);
    assert.equal(await run(`document.querySelector('input[aria-label="Show Renderer goal events"]').checked`),false);
    await click('input[aria-label="Show Renderer goal events"]');
    await waitFor(`!!document.querySelector('.timeline-event[data-task-id="renderer-goal-task"]')`);
    await durable();
    const beforeGoalEdit = (await stored()).state;
    await click('button[aria-label="Goal options for Renderer goal"]');
    await button('Edit goal', "document.querySelector('.calendar-group-menu')");
    await type('input[aria-label="Goal name"]','Renamed goal');
    await click('button[aria-label="Change goal colour"]');
    await click('.calendar-colour-palette input[aria-label="Muted teal"]');
    await click('button[aria-label="Save goal"]');
    await durable();
    const afterGoalEdit = (await stored()).state;
    assert.equal(afterGoalEdit.goals.find(goal=>goal.id==='renderer-goal').name,'Renamed goal');
    assert.equal(afterGoalEdit.goals.find(goal=>goal.id==='renderer-goal').color,'teal');
    assert.deepEqual(afterGoalEdit.tasks,beforeGoalEdit.tasks);
    await button('Undo', "document.querySelector('.undo-toast')");
    await durable();
    assert.deepEqual((await stored()).state.goals,beforeGoalEdit.goals);
    await button('Renderer goal', "document.querySelector('.goals-rail')");
    await waitFor(`document.querySelector('dialog[open]')?.textContent.includes('Renderer goal')`);
    assert.equal(await run(`document.querySelector('dialog[open] .goal-task-list').children.length`),15);
    await button('Show more steps (2 remaining)', "document.querySelector('dialog[open]')");
    assert.equal(await run(`document.querySelector('dialog[open] .goal-task-list').children.length`),17);
    await click('dialog[open] .missed-history summary');
    assert.equal(await run(`document.querySelector('dialog[open] .missed-history ul').children.length`),15);
    await button('Show more history (1 remaining)', "document.querySelector('dialog[open]')");
    assert.equal(await run(`document.querySelector('dialog[open] .missed-history ul').children.length`),16);
    await click('dialog[open] button[aria-label="Close dialog"]');
    await click('button[aria-label="Goal options for Renderer goal"]');
    await button('Edit goal', "document.querySelector('.calendar-group-menu')");
    await type('input[aria-label="Goal name"]','Unsaved goal name');
    await click('button[aria-label="Cancel goal editing"]');
    await button('Keep editing');
    assert.equal(await run(`document.querySelector('input[aria-label="Goal name"]').value`),'Unsaved goal name');
    await click('button[aria-label="Calendar options for Personal tasks"]');
    await button('Edit calendar', "document.querySelector('.calendar-group-menu')");
    await button('Discard changes');
    await waitFor(`!!document.querySelector('input[aria-label="Calendar name"]') && !document.querySelector('input[aria-label="Goal name"]')`);
    await type('input[aria-label="Calendar name"]','Shared calendar');
    await click('button[aria-label="Save calendar"]');
    await durable();
    assert.equal((await stored()).state.personalCalendar.name,'Shared calendar');
    await button('Undo', "document.querySelector('.undo-toast')");
    await durable();
    console.log('PASS renderer: Calendar and Active goals share rows; goal visibility persists, inline name/colour edits preserve tasks and Undo, details open, dirty editors are protected');
    assert.deepEqual(problems, []);
    exitCode = 0;
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    window?.destroy();
    try {
      await runtime?.close();
    } catch (error) {
      console.error(error);
      exitCode = 1;
    }
    app.exit(exitCode);
  }
});
