import AWS from "aws-sdk";

class LexService {
  constructor() {
    this.userId = user-${Date.now()};
    this.lexRuntime = new AWS.LexRuntimeV2({
      region: process.env.REACT_APP_AWS_REGION,
      accessKeyId: process.env.REACT_APP_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.REACT_APP_AWS_SECRET_ACCESS_KEY,
    });
  }

  async sendToLex(userInput) {
    try {
      const params = {
        botId: process.env.REACT_APP_LEX_BOT_ID,
        botAliasId: process.env.REACT_APP_LEX_BOT_ALIAS_ID,
        localeId: process.env.REACT_APP_LEX_LOCALE_ID,
        sessionId: this.userId,
        text: userInput,
      };

      const response = await this.lexRuntime.recognizeText(params).promise();

      if (response.messages && response.messages.length > 0) {
        return response.messages[0].content;
      } else {
        return "⚠️ Sorry, I didn’t understand that.";
      }
    } catch (error) {
      console.error("Lex error:", error);
      return "⚠️ Error communicating with Lex.";
    }
  }
}

export default LexService;