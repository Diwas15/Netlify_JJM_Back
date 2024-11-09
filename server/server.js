import express from 'express';
import bodyParser from 'body-parser';
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose';
import schemeSchema from './Schemas/schemeSchema.js';
import qr from './Schemas/qrSchema.js'
import authority from './Schemas/authority.js';
import Evaluation from './Schemas/Evaluation.js';
import token from './Schemas/token.js';
import nodemailer from 'nodemailer'
import * as crypto from 'crypto';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';


const app = express();

const port = process.env.PORT || 8080;


const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); 

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});


///////////////////////////////////////////DB CONNECTION/////////////////////////////////////////////////
const url = "mongodb+srv://NeerajBelwal:ryPw3zFAAkprLnuX@cluster0.es0je.mongodb.net/JAL_JEEVAN_MISSION?retryWrites=true&w=majority&appName=Cluster0"

mongoose.connect(url).then(()=>console.log("connection successful")).catch((err)=>console.log(err));



//////////////////////////////////////////middle wares///////////////////////////////////////////////////////



app.use(cookieParser());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb' ,extended: true }));
app.use(bodyParser.raw({
  type: 'image/jpeg',
  limit: '10mb'
}))


app.use((req,res,next)=>{
    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Allow-Headers","*");
    next();
});


app.use('/',function(req,res,next){
  console.log(req.path)
  if(req.path==='/'){
    let tok = req.query.token;
    console.log("query ",tok)
    console.log("cookies  ",req.cookies)
    try{
      let decoded = jwt.verify(tok,publicKey)
      console.log("dekho             ", decoded)
    }
    catch(err){
      console.log("ye raha error ---------------------------->",err);
      res.set("Set-Cookie","");
      res.set("Cache-Control","no-store");
      res.status(401).send("TOKEN EXPIRED LOGIN AGAIN");
    }
    app.use(express.static(path.join(__dirname,"../build"),{setHeaders:function(res,path,stat){res.set('Set-Cookie', `token=${tok};HttpOnly`), res.set('Cache-Control','max-age=0, must-revalidate')}}));
    next();
  }
   
  
})











/////////////////////////////////////////////////routes/////////////////////////////////////////////////////


app.get('/res',(req,res)=>{
  jwt.verify(req.cookies.token,publicKey);
  res.status(404).send(req.cookies);
})




app.post('/verifyToken',(req,res)=>{
  console.log(req)
    let decoded = jwt.verify(req.headers.authorization,publicKey);
    
    Evaluation.find({Email:decoded.cred.user,SchemeID:req.body.schemeID}).exec().then((data)=>{
      console.log(data);
      if(data.length>0)
        return res.status(200).send("You have already submitted the evaluation for this scheme");
      else{
        Evaluation.create({Email:decoded.cred.user,schemeEvaluation:req.body.data,SchemeID:req.body.schemeID}).then((data)=>{
          return res.status(201).send("Evaluation Submitted");
        }).catch((err)=>{
          console.log(err);
          res.status(401).send(err);
        })
      }
    }).catch((err)=>{
      console.log(err);
    });
})


app.post('/addScheme',(req,res)=>{
  console.log(req.body);
  let scheme = req.body;
  let ID = scheme.Basic_Details['Scheme ID'];
  if(qr.exists({schemeID:ID})) return res.status(400).send();
  schemeSchema.create({schemeID:ID, data:scheme}).then((result)=>{
    console.log(result);
    fetch(`http://api.qrserver.com/v1/create-qr-code/?data=http://localhost:3000/schemes?schemeID=${ID}&size=150x150`,{
        method:'GET',
      
    }).then((response)=>response.arrayBuffer().then((dat)=>{
        // let b64 = dat.toString('base64');
        var base64String = btoa(String.fromCharCode.apply(null, new Uint8Array(dat)));
        qr.create({schemeID:ID,Name:scheme.Basic_Details.Name,data:base64String}).then((data)=>{
          return res.status(201).send();
        }).catch((err)=>{
          console.log(err);
          return res.status(400).send();
        })
    }));
  }).catch((err)=>{
    console.log(err);
      return res.status(401).send();
  })
})




const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // Use `true` for port 465, `false` for all other ports
  auth: {
    user: "satidiwas@gmail.com",
    pass: "wtzh gvij lulp sktb",
  },
});


const otpGenerator = ()=>{
  let digits = '0123456789'; 
  let OTP = ''; 
  let len = digits.length 
  for (let i = 0; i < 4; i++) { 
      OTP += digits[Math.floor(Math.random() * len)]; 
  } 
   
  return OTP; 
}



const otpVerifyList = {

}
app.get('/getOtp',(req,res)=>{
  console.log(req.headers.user)
  const otp = otpGenerator();
  transporter.sendMail({
      from: '"Jal Sansthan"', // sender address
      to: req.headers.user, // list of receivers
      subject: "OTP for Verification", // Subject line, 
      html: `<p>${otp}</p>`, // html body
    }).then((info)=>{
      console.log(info.messageId);
      otpVerifyList[req.headers.user] = otp;
      res.status(200).send();
    })
    .catch((err)=>{
      console.log(err);
      res.status(400).send();
    });
})

app.post('/verifyOtp',(req,res)=>{
  if(!authority.exists({Email:req.body.user}))  return res.status(401).send();
  if(req.body.otp == otpVerifyList[req.body.user]){
    var token = jwt.sign({cred:req.body}, privateKey, { algorithm: 'RS256', expiresIn: 15*60});
    delete otpVerifyList[req.body.user];
    //res.cookie("evalToken",token);
    res.set('Set-Cookie', `token=${token}`);
    res.set('Cache-Control','no-store');
    res.status(200).send(token);
  }
  else{
    delete otpVerifyList[req.body.user];
    res.status(402).send();
  }
  })
app.get('/schemes',(req,res)=>{
    console.log(req.query);
    if(req.query=={}) return res.status(400).send();
    
    schemeSchema.find({schemeID:req.query.schemeID}).then((arr)=>{
        console.log(arr);
        if(arr.length==0) return res.status(301).send();
        else return res.status(200).send(arr[0].data);
    }).catch((err)=>{
        res.status(404).send(err);
    });
});


app.get("/getQrData",(req,res)=>{
  console.log("schemesQR ke andar ----------------->",req.cookies)

  qr.find().then((data)=>{
    res.status(200).send(data);
  }).catch((err)=>{
    res.status(304).send(err);
  })
})

app.post('/grievance',(req,res)=>{
  console.log(req.body);
  res.status(200).send();
})


app.use(express.static(path.join(__dirname,"../../frontend/build")));
app.get("*",(req,res)=>{
  res.sendFile(path.resolve(__dirname,"../../frontend/build/index.html"))
})

app.listen(port,'0.0.0.0',()=>{
    console.log(`server running on port ${port}`);
})
