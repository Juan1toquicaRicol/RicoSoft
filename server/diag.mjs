import jwt from "jsonwebtoken";
import "dotenv/config";

const USER_ID = "1c4a855c-4778-40cd-9056-dd3a348e9fe5";
const RICOL_ID = "704858c1-3f56-467b-b658-7e7f2d77175c";

const token = jwt.sign({ sub: USER_ID, tv: 0, tenantId: RICOL_ID }, process.env.JWT_SECRET, {
  expiresIn: "8h",
});
console.log(token);
