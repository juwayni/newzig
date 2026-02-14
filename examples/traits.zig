const std = @import("std");
const Logger = struct {
    pub fn validate(comptime T: type) void {
        if (!@hasDecl(T, "log")) @compileError("Type " ++ @typeName(T) ++ " does not implement log");
    }
};

const MyLogger = struct {
    id: i32,

    // Impl Logger
pub fn log(self: *MyLogger, msg: []const u8) void {
        return std.debug.print("Logger {d}: {s}\n", .{ self.id, msg });
    }

};

fn useLogger(comptime T: type, logger: *T) void {
    comptime Logger.validate(T);
    return logger.log("Hello from trait");
}

fn zen_main(alloc: std.mem.Allocator) anyerror!i32 {
    _ = alloc;
    var l = MyLogger{ .id = 42 };
    _ = useLogger(MyLogger, &l);
    return 0;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    const allocator = gpa.allocator();
    _ = try zen_main(allocator);
}
