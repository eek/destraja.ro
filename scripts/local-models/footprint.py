"""Process memory as Activity Monitor shows it (phys_footprint), without importing MLX."""

import os


def footprint_gb(pid: int | None = None) -> float:
    """phys_footprint of a process in GB (10^9), from proc_pid_rusage(RUSAGE_INFO_V2); 0.0 if unavailable."""
    import ctypes

    class RUsageInfoV2(ctypes.Structure):
        _fields_ = [("ri_uuid", ctypes.c_uint8 * 16)] + [(n, ctypes.c_uint64) for n in (
            "ri_user_time", "ri_system_time", "ri_pkg_idle_wkups", "ri_interrupt_wkups", "ri_pageins", "ri_wired_size",
            "ri_resident_size", "ri_phys_footprint", "ri_proc_start_abstime", "ri_proc_exit_abstime", "ri_child_user_time",
            "ri_child_system_time", "ri_child_pkg_idle_wkups", "ri_child_interrupt_wkups", "ri_child_pageins",
            "ri_child_elapsed_abstime", "ri_diskio_bytesread", "ri_diskio_byteswritten")]

    try:
        libc = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
        info = RUsageInfoV2()
        if libc.proc_pid_rusage(pid or os.getpid(), 2, ctypes.byref(info)) != 0:
            return 0.0
        return info.ri_phys_footprint / 1e9
    except OSError:
        return 0.0
