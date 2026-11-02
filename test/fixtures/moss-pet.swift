import AppKit

@main struct Check {
    static func main() {
        func snapshot(_ status: String, available: Bool = true) -> [String: Any] {
            ["available": available, "tasks": [["id": "a", "status": status]]]
        }
        var state = MossPetState()
        precondition(state.runningCount == 0 && !state.available)
        state.update(snapshot("completed")); precondition(state.status == "暂无运行任务")
        state.update(snapshot("running")); precondition(state.runningCount == 1)
        state.update(snapshot("completed")); precondition(state.status == "本轮结束" && state.newlyEndedCount == 1)
        state.update(snapshot("completed")); precondition(state.newlyEndedCount == 0)
        state.update(snapshot("running")); state.update(snapshot("cancelled")); precondition(state.status == "已取消" && state.newlyEndedCount == 1)
        state.update(snapshot("running")); state.update(snapshot("failed")); precondition(state.status == "异常")
        state.update(snapshot("running", available: false)); precondition(state.runningCount == 0 && state.status == "状态未知")
        state.update(snapshot("completed")); precondition(state.status == "暂无运行任务")
        state.update(snapshot("unknown")); precondition(state.status == "状态未确认" && state.newlyEndedCount == 0)
        let pet = MossPet()
        pet.updateTasks(snapshot("running")); pet.updateTarget("测试目标")
        pet.receive(["type": "history", "messages": [["role": "user", "content": "<script>plain text</script>"]]])
        pet.receive(["type": "message", "role": "assistant", "content": "hello"])
        pet.receive(["type": "state", "name": "thinking", "detail": "正在处理"])
        var expanded = 0
        pet.onExpand = { expanded += 1 }
        pet.openChat(); precondition(expanded == 1 && pet.chatPanel == nil)
        pet.configure(enabled: false); pet.hide(); pet.shutdown()
        precondition(!pet.enabled && pet.petPanel == nil && pet.chatPanel == nil)
        print("MOSS_PET_PASS")
    }
}
