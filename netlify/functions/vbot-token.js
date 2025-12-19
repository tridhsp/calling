exports.handler = async () => {
  // Return all available SDK tokens for multi-device ringing
  const tokens = [];
  
  if (process.env.VBOT_TOKEN_SDK) tokens.push(process.env.VBOT_TOKEN_SDK);
  if (process.env.VBOT_TOKEN_SDK_2) tokens.push(process.env.VBOT_TOKEN_SDK_2);
  if (process.env.VBOT_TOKEN_SDK_3) tokens.push(process.env.VBOT_TOKEN_SDK_3);
  if (process.env.VBOT_TOKEN_SDK_4) tokens.push(process.env.VBOT_TOKEN_SDK_4);
  if (process.env.VBOT_TOKEN_SDK_5) tokens.push(process.env.VBOT_TOKEN_SDK_5);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      VBOT_TOKEN: process.env.VBOT_TOKEN_SDK,
      VBOT_TOKENS: tokens,
      TOKEN_COUNT: tokens.length
    }),
  };
};