/**
 * kitchenCleanup.js
 * 1. Auto-archive kitchen orders that have been "Ready" for > READY_ARCHIVE_MINS minutes
 * 2. Auto-expire tokens after 24 hours (mark as closed if still open)
 */
const cron   = require('node-cron');
const Order  = require('../models/Order');
const OrderSession = require('../models/OrderSession');
const Table  = require('../models/Table');

const READY_ARCHIVE_MINS = parseInt(process.env.KITCHEN_ARCHIVE_MINS || '5', 10);

// Move orders that have been "Ready" too long to "Delivered" (archived from active view)
const archiveReadyOrders = async (io) => {
  try {
    const cutoff = new Date(Date.now() - READY_ARCHIVE_MINS * 60 * 1000);
    const stale = await Order.find({
      kitchen_status: 'Ready',
      updatedAt: { $lt: cutoff },
    }).lean();

    if (!stale.length) return;

    const ids = stale.map(o => o._id);
    await Order.updateMany({ _id: { $in: ids } }, { $set: { kitchen_status: 'Delivered' } });

    // Notify kitchen screens via socket
    if (io) {
      for (const o of stale) {
        const fid = (o.franchise_id?._id || o.franchise_id)?.toString();
        if (fid) {
          io.to(`franchise:${fid}`).emit('order:statusUpdate', {
            orderId: o._id.toString(),
            status: 'Delivered',
            autoArchived: true,
          });
        }
      }
    }
    console.log(`[KitchenCleanup] Auto-archived ${stale.length} Ready orders → Delivered`);
  } catch (err) {
    console.error('[KitchenCleanup] archiveReadyOrders error:', err.message);
  }
};

// Expire sessions/tokens open for more than 24 hours without checkout
const expireStaleTokens = async (io) => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await OrderSession.find({
      status: { $in: ['open', 'bill_pending', 'on_hold', 'pending_cancel', 'pending_pos'] },
      openedAt: { $lt: cutoff },
    }).lean();

    if (!stale.length) return;

    const ids = stale.map(s => s._id);
    await OrderSession.updateMany({ _id: { $in: ids } }, {
      $set: { status: 'closed', closedAt: new Date(), cancel_reason: 'Auto-expired after 24h' }
    });

    // Free associated tables
    const tableIds = stale.filter(s => s.tableId).map(s => s.tableId);
    if (tableIds.length) {
      await Table.updateMany(
        { _id: { $in: tableIds } },
        { $set: { status: 'available', currentSessionId: null } }
      );
      if (io) {
        for (const s of stale.filter(s => s.tableId)) {
          const fid = (s.franchiseId?._id || s.franchiseId)?.toString();
          if (fid) {
            io.to(`franchise:${fid}`).emit('table:statusUpdated', {
              tableId: s.tableId.toString(),
              status: 'available',
              sessionCleared: true,
              autoExpired: true,
            });
          }
        }
      }
    }
    console.log(`[KitchenCleanup] Expired ${stale.length} stale tokens (24h+)`);
  } catch (err) {
    console.error('[KitchenCleanup] expireStaleTokens error:', err.message);
  }
};

const startKitchenCleanupCron = (io) => {
  // Every minute: archive Ready orders older than READY_ARCHIVE_MINS
  cron.schedule('* * * * *', () => archiveReadyOrders(io), { timezone: 'Asia/Kolkata' });
  // Every hour: expire tokens older than 24h
  cron.schedule('0 * * * *', () => expireStaleTokens(io), { timezone: 'Asia/Kolkata' });
  console.log(`[KitchenCleanup] Cron started — archive Ready after ${READY_ARCHIVE_MINS}min, expire tokens after 24h`);
};

module.exports = { startKitchenCleanupCron, archiveReadyOrders, expireStaleTokens };
