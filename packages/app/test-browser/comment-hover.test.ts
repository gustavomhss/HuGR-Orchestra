import { expect, test } from "bun:test"
import { createHoverCommentUtility, type HoverCommentLine } from "@opencode-ai/session-ui/pierre/comment-hover"

test("keeps the initial hovered line for activation after hover clears", () => {
  let line: HoverCommentLine | undefined = { lineNumber: 1, side: "additions" }
  const calls: HoverCommentLine[] = []
  const button = createHoverCommentUtility({ label: "Comment", getHoveredLine: () => line, onSelect: (v) => calls.push(v) })
  if (!button) throw new Error("comment button was not created")
  document.body.append(button)
  line = undefined
  button.click()
  expect(calls).toEqual([{ lineNumber: 1, side: "additions" }])
  button.remove()
  document.dispatchEvent(new Event("pointermove"))
})
