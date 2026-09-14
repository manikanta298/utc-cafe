const mongoose = require('mongoose');
const sessionItemSchema = new mongoose.Schema({ menuItemId:{type:mongoose.Schema.Types.ObjectId,ref:'MenuItem'}, name:{type:String,required:true}, qty:{type:Number,required:true,min:1}, unitPrice:{type:Number,required:true}, totalPrice:{type:Number,required:true}, gst_rate:{type:Number,default:5}, hsn_code:{type:String,default:''}, notes:{type:String,default:''} },{_id:true});
const subOrderSchema = new mongoose.Schema({ orderedAt:{type:Date,default:Date.now}, isAddition:{type:Boolean,default:false}, destination:{type:String,enum:['kitchen','counter','both','none'],default:'kitchen'}, items:[sessionItemSchema], placedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, order_id:{type:mongoose.Schema.Types.ObjectId,ref:'Order'} },{_id:true});
const paymentEntrySchema = new mongoose.Schema({ amount:{type:Number,required:true}, method:{type:String,enum:['Cash','UPI','Card','Net Banking','Wallet','Loyalty Points','Split'],required:true}, paidAt:{type:Date,default:Date.now}, receivedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, reference:{type:String,default:''} },{_id:true});
const orderSessionSchema = new mongoose.Schema({
 tokenNumber:{type:String}, sessionRef:{type:String,unique:true}, franchiseId:{type:mongoose.Schema.Types.ObjectId,ref:'Franchise',required:true}, tableId:{type:mongoose.Schema.Types.ObjectId,ref:'Table',default:null}, tableNumber:{type:String,default:'Counter'}, customerMobile:{type:String,required:true}, customerId:{type:mongoose.Schema.Types.ObjectId,ref:'Customer',default:null}, customerName:{type:String,default:''}, orderType:{type:String,enum:['dine_in','counter','parcel'],default:'dine_in'}, status:{type:String,enum:['pending_pos','open','bill_pending','on_hold','paid','closed','cancelled','pending_cancel'],default:'open'}, subOrders:[subOrderSchema], mergedItems:[sessionItemSchema], subtotal:{type:Number,default:0}, cgst_amount:{type:Number,default:0}, sgst_amount:{type:Number,default:0}, total_tax:{type:Number,default:0}, discountAmount:{type:Number,default:0}, couponCode:{type:String,default:''}, totalAmount:{type:Number,default:0},
 loyaltyPointsRedeemed:{type:Number,default:0}, loyaltyRedemptionAmount:{type:Number,default:0}, loyaltyPointsEarned:{type:Number,default:0}, paidAmount:{type:Number,default:0}, paymentStatus:{type:String,enum:['unpaid','partially_paid','advance_paid','fully_paid'],default:'unpaid'}, payments:[paymentEntrySchema], invoiceId:{type:mongoose.Schema.Types.ObjectId,ref:'Invoice',default:null},
 openedAt:{type:Date,default:Date.now}, billGeneratedAt:{type:Date,default:null}, closedAt:{type:Date,default:null}, openedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, approvedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null}, approvedAt:{type:Date,default:null}, rejectedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null}, rejectedAt:{type:Date,default:null}, rejectionReason:{type:String,default:''}, isParcel:{type:Boolean,default:false}, held_at:{type:Date,default:null}, hold_note:{type:String,default:''}, cancelled_at:{type:Date,default:null}, cancel_reason:{type:String,default:''}, visitType:{type:String,enum:['single','couple','family','friends'],default:'single'}
},{timestamps:true});
orderSessionSchema.index({franchiseId:1,status:1,openedAt:-1}); orderSessionSchema.index({customerMobile:1,franchiseId:1,status:1}); orderSessionSchema.index({franchiseId:1,tokenNumber:1},{unique:true,sparse:true,partialFilterExpression:{tokenNumber:{$type:'string'}},name:'franchiseId_tokenNumber_partial_unique'}); orderSessionSchema.index({franchiseId:1,openedAt:-1,paymentStatus:1});

// Global, franchise-independent accrual safety net. This catches every payment path
// (Cash/Card/UPI/QR/Split) and makes earning happen only after a session is fully paid.
orderSessionSchema.post('save', function(doc) {
  if (doc.status !== 'paid' || !doc.customerId || Number(doc.loyaltyPointsEarned || 0) > 0) return;
  setImmediate(async () => {
    try {
      const Loyalty = require('./Loyalty'); const Customer = require('./Customer'); const GlobalLoyaltySetting = require('./GlobalLoyaltySetting');
      if (await Loyalty.exists({ session_id: doc._id, transaction_type: 'earn' })) return;
      const setting = await GlobalLoyaltySetting.findOne({key:'global'}).lean() || {earningAmount:100,earningPoints:10};
      const customer = await Customer.findById(doc.customerId); if (!customer) return;
      const eligible = Math.max(0, Number(doc.totalAmount || 0) - Number(doc.discountAmount || 0));
      const earned = Math.floor(eligible / setting.earningAmount * setting.earningPoints);
      const before = Number(customer.total_points || 0); customer.total_points = before + earned; await customer.save();
      await Loyalty.create({customer_id:customer._id,session_id:doc._id,franchise_id:doc.franchiseId,transaction_type:'earn',points_earned:earned,balance_before:before,balance_after:customer.total_points,bill_amount:eligible});
      await mongoose.model('OrderSession').updateOne({_id:doc._id,loyaltyPointsEarned:0},{$set:{loyaltyPointsEarned:earned}});
    } catch (e) { console.error('[loyalty accrual]', e.message); }
  });
});
module.exports = mongoose.model('OrderSession',orderSessionSchema);
