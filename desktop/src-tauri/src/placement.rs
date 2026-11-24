//! Placement in target-display physical pixels; logical UI size stays fixed.
pub const OVERLAY_WIDTH: f64 = 620.0;
pub const OVERLAY_HEIGHT: f64 = 440.0;

pub fn logical_point(point: (f64, f64), scale: f64) -> (f64, f64) {
    (point.0 / scale, point.1 / scale)
}

pub fn centered_overlay_origin(work: (f64, f64, f64, f64), scale: f64) -> (f64, f64) {
    (
        work.0 + ((work.2 - OVERLAY_WIDTH * scale) / 2.0).max(0.0),
        work.1 + ((work.3 - OVERLAY_HEIGHT * scale) / 2.0).max(0.0),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_display_keeps_logical_size_and_respects_work_area() {
        assert_eq!(centered_overlay_origin((0.0, 30.0, 1920.0, 988.0), 1.0), (650.0, 304.0));
    }

    #[test]
    fn retina_secondary_uses_its_own_origin_and_scale() {
        let origin = centered_overlay_origin((3840.0, 67.0, 3420.0, 2147.0), 2.0);
        assert_eq!(origin, (4930.0, 700.5));
        assert_eq!(logical_point(origin, 2.0), (2465.0, 350.25));
        assert_eq!((OVERLAY_WIDTH * 2.0, OVERLAY_HEIGHT * 2.0), (1240.0, 880.0));
    }

    #[test]
    fn negative_display_coordinates_are_not_clamped_to_primary() {
        assert_eq!(centered_overlay_origin((-1920.0, -1080.0, 1920.0, 1080.0), 1.0), (-1270.0, -760.0));
    }

    #[test]
    fn small_work_area_anchors_at_its_origin_instead_of_going_negative() {
        assert_eq!(centered_overlay_origin((100.0, 40.0, 300.0, 200.0), 2.0), (100.0, 40.0));
    }

    #[test]
    fn mac_cursor_lookup_normalizes_primary_scale_independently_of_target() {
        assert_eq!(logical_point((5000.0, 600.0), 2.0), (2500.0, 300.0));
        assert_eq!(logical_point((2500.0, 300.0), 1.0), (2500.0, 300.0));
    }
}
