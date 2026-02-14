const std = @import("std");
fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    var list = std.ArrayList(i32).init(alloc);
    defer list.deinit();
    _ = try list.append(100);
    _ = std.debug.print("List length inside: {d}\n", .{ list.items.len });
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
