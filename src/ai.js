async function chat(messages) {
  const response = await fetch('https://ai.hackclub.com/proxy/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.HCAI}`
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages
    })
  });
  const data = await response.json();
  return data.choices[0].message.content;
}

module.exports = { chat };
