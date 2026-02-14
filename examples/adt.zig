const std = @import("std");
const Shape = union(enum) {
    Circle: f32,
    Square: f32,
    None,
};

fn getArea(shape: Shape) f32 {
    return switch (shape) {
        .Circle => |r| r * r * 3.14,
        .Square => |s| s * s,
        .None => 0.0,
    };
}

fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    const c = Shape{ .Circle = 10.0 };
    const area = getArea(c);
    _ = std.debug.print("Area: {d}\n", .{area});
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
