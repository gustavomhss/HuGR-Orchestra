import { expect, test } from "bun:test"
import { createHoverCommentUtility, type HoverCommentLine } from "@opencode-ai/session-ui/pierre/comment-hover"

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
