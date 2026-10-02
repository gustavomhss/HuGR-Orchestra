import { expect, test } from "bun:test"
import { createHoverCommentUtility, type HoverCommentLine } from "@opencode-ai/session-ui/pierre/comment-hover"
import { createLineCommentGutterRenderer } from "@opencode-ai/session-ui/line-comment-annotations"

test("keeps the initial hovered line for activation after hover clears", () => {
  let line: HoverCommentLine | undefined = { lineNumber: 1, side: "additions" }
  const calls: HoverCommentLine[] = []
  const button = createHoverCommentUtility({
    label: "Comment",
    getHoveredLine: () => line,
    onSelect: (v) => calls.push(v),
  })
  if (!button) throw new Error("comment button was not created")
  document.body.append(button)
  line = undefined
  button.click()
  expect(calls).toEqual([{ lineNumber: 1, side: "additions" }])
  button.remove()
  document.dispatchEvent(new Event("pointermove"))
})

test("pins the hovered line on focus without opening its editor", () => {
  const focused: HoverCommentLine[] = []
  const opened: HoverCommentLine[] = []
  const button = createHoverCommentUtility({
    label: "Comment",
    getHoveredLine: () => ({ lineNumber: 3, side: "deletions" }),
    onFocus: (line) => focused.push(line),
    onSelect: (line) => opened.push(line),
  })
  if (!button) throw new Error("comment button was not created")
  document.body.append(button)
  button.focus()
  expect(focused).toEqual([{ lineNumber: 3, side: "deletions" }])
  expect(opened).toEqual([])
  button.remove()
  document.dispatchEvent(new Event("pointermove"))
})

test("focus preserves an opened comment's containing range", () => {
  const focused: unknown[] = []
  const opened: unknown[] = []
  const button = createLineCommentGutterRenderer({
    label: "Comment",
    getSelectedRange: () => null,
    getFocusSelectedRange: () => ({ start: 2, end: 4, side: "additions" }),
    onFocus: (range) => focused.push(range),
    onOpenDraft: (range) => opened.push(range),
  })(() => ({ lineNumber: 4, side: "additions" }))
  if (!button) throw new Error("comment button was not created")
  document.body.append(button)
  button.focus()
  expect(focused).toEqual([])
  expect(opened).toEqual([])
  button.remove()
  document.dispatchEvent(new Event("pointermove"))
})
