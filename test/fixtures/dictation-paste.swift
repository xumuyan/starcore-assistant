import AppKit

@main
enum DictationPasteChecks {
    static func main() {
        let accepted = DictationInputPolicy.permits(originalPID: 10, currentPID: 10, sameElement: true,
            sameSelection: true, editable: true, secure: false, terminal: false, currentRequest: true)
        precondition(accepted)
        for i in 0..<7 {
            precondition(!DictationInputPolicy.permits(originalPID: 10, currentPID: i == 0 ? 11 : 10,
                sameElement: i != 1, sameSelection: i != 2, editable: i != 3,
                secure: i == 4, terminal: i == 5, currentRequest: i != 6))
        }
        for bundle in ["com.apple.Terminal", "dev.warp.Warp-Stable", "com.googlecode.iterm2", "com.mitchellh.ghostty"] {
            precondition(DictationInputPolicy.isTerminal(bundleID: bundle, label: ""))
        }
        precondition(DictationInputPolicy.isTerminal(bundleID: "com.example.editor", label: "xterm.js terminal"))
        precondition(!DictationInputPolicy.isTerminal(bundleID: "com.apple.TextEdit", label: "editor"))
        precondition(!DictationInputPolicy.editable(role: "AXTextArea", enabled: true, reported: nil, valueSettable: false, selectedTextSettable: false))
        precondition(!DictationInputPolicy.editable(role: "AXTextField", enabled: true, reported: false, valueSettable: true, selectedTextSettable: true))
        precondition(DictationInputPolicy.editable(role: "AXTextArea", enabled: true, reported: nil, valueSettable: false, selectedTextSettable: true))
        precondition(DictationInputPolicy.editable(role: "AXTextField", enabled: true, reported: true, valueSettable: false, selectedTextSettable: false))
        precondition(!DictationInputPolicy.editable(role: "AXTextArea", enabled: false, reported: true, valueSettable: true, selectedTextSettable: true))

        let paste = DictationPaste()
        let unavailable = DictationPasteTarget(pid: 0, element: nil, selection: nil, reason: "仅手动复制")
        var rejected = 0
        paste.insert("fixture", target: unavailable, isCurrent: { true }) { posted, detail in
            precondition(!posted && detail == "仅手动复制"); rejected += 1
        }
        paste.cancel()
        paste.insert("fixture", target: unavailable, isCurrent: { false }) { posted, detail in
            precondition(!posted && detail == "本轮已取消"); rejected += 1
        }
        precondition(rejected == 2)
        paste.cancel()

        let board = NSPasteboard.withUniqueName()
        defer { board.releaseGlobally() }
        let original = NSPasteboardItem()
        original.setString("original", forType: .string)
        let rich = Data([1, 4, 8, 16]); original.setData(rich, forType: .rtf)
        board.writeObjects([original])
        let transaction = DictationClipboardTransaction(board: board)
        precondition(transaction.write("new text"))
        precondition(board.string(forType: .string) == "new text")
        precondition(board.types?.contains(DictationClipboardTransaction.transientType) == true)
        precondition(transaction.restoreIfUnchanged())
        precondition(board.string(forType: .string) == "original")
        precondition(board.data(forType: .rtf) == rich)

        let changed = DictationClipboardTransaction(board: board)
        precondition(changed.write("temporary"))
        board.clearContents(); board.setString("copied while processing", forType: .string)
        precondition(!changed.restoreIfUnchanged())
        precondition(board.string(forType: .string) == "copied while processing")

        board.clearContents()
        let empty = DictationClipboardTransaction(board: board)
        precondition(empty.write("temporary")); precondition(empty.restoreIfUnchanged())
        precondition(board.pasteboardItems?.isEmpty ?? true)

        // No system key is posted: injected operations exercise stale completion
        // and cancellation on this private pasteboard only.
        board.setString("before", forType: .string)
        var current = true, posts = 0, callbacks = 0
        var pending: [() -> Void] = []
        let controlled = DictationPaste(board: { board }, checkTarget: { _ in true }, modifiersReleased: { true },
            postPaste: { posts += 1; return true }, schedule: { pending.append($0) })
        let target = DictationPasteTarget(pid: 0, element: nil, selection: nil, reason: nil)
        controlled.insert("one", target: target, isCurrent: { current }) { _, _ in callbacks += 1 }
        precondition(posts == 1)
        current = false; pending.removeFirst()()
        precondition(callbacks == 0 && board.string(forType: .string) == "before")
        current = true
        controlled.insert("two", target: target, isCurrent: { current }) { _, _ in callbacks += 1 }
        precondition(posts == 2, "stale completion must release the internal insertion gate")
        controlled.cancel()
        precondition(board.string(forType: .string) == "before")
        pending.removeFirst()()
        precondition(callbacks == 0)
        print("DICTATION_PASTE_PASS")
    }
}
