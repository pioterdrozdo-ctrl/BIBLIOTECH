(function installReservationQueueBridge() {
    const controller = window.BibliotechReservationQueue;
    if (!controller?.performReservationAction) {
        window.setTimeout(installReservationQueueBridge, 20);
        return;
    }
    window.toggleBookRental = controller.performReservationAction;
    try { toggleBookRental = controller.performReservationAction; } catch {}
})();
