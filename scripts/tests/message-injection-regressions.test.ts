import assert from "node:assert/strict";
import test from "node:test";

import { sendMessage } from "../../src/js/modules/webview/methods/message/injection.ts";

type JsResult = { success?: boolean; message?: string; inputType?: string };

function createWebviewMock(results: JsResult[]) {
  const jsCalls: string[] = [];
  const inputChars: string[] = [];

  return {
    webview: {
      executeJavaScript: (script: string) => {
        jsCalls.push(script);
        const next = results.shift();
        return next ?? { success: true };
      },
      sendInputEvent: (event: { type: string; keyCode: string }) => {
        if (event.type === "char") inputChars.push(event.keyCode);
      },
    },
    jsCalls,
    inputChars,
  };
}

void test("character-by-character mode uses bulk insert path when available", async () => {
  const { webview, inputChars } = createWebviewMock([
    { success: true, inputType: "character-by-character" },
    { success: true },
  ]);

  const result = await sendMessage(webview as never, {
    message: "this is a long grok payload",
  });

  assert.equal(result.success, true);
  assert.equal(inputChars.length <= 2, true);
});
